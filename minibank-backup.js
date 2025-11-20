/* MiniBank – Local Backup / Restore / Reset (IndexedDB)
 * نسخة مستقلة لا تلمس منطق MiniBank الأساسي
 */

(function () {
  const DB_NAME = 'minibank_store';
  const DB_VERSION = 6;
  const STORES = ['profile', 'wallet', 'tx', 'family', 'insights_history'];

  function openMiniBankDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        // هذا الملف لا ينشئ/يعدل الـ schema – يفترض أن MiniBank أنشأه مسبقًا
        console.warn(
          '[MiniBank Backup] onupgradeneeded fired – schema يجب أن يُدار من minibank-core.js فقط.'
        );
      };
    });
  }

  function getAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(storeName, 'readonly');
      } catch (e) {
        console.warn(
          `[MiniBank Backup] store ${storeName} غير موجود في هذه النسخة من الـ DB`,
          e
        );
        return resolve([]);
      }
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function exportMiniBankData() {
    try {
      const db = await openMiniBankDB();
      const payload = {
        meta: {
          app: 'MiniBank',
          module: 'Family Wallet + Money AI',
          version: 10,
          exportedAt: new Date().toISOString(),
          dbName: DB_NAME,
          dbVersion: DB_VERSION,
          stores: STORES.slice(),
        },
        stores: {},
      };

      for (const s of STORES) {
        payload.stores[s] = await getAllFromStore(db, s);
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `minibank-backup-v10-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 0);

      alert('✅ Backup exported – تم تنزيل ملف النسخة الاحتياطية.');
    } catch (err) {
      console.error('[MiniBank Backup] export error:', err);
      alert('❌ لم نتمكّن من إنشاء النسخة الاحتياطية. راجع الـ Console.');
    }
  }

  async function importMiniBankDataFromFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!json || !json.meta || !json.stores) {
        alert('❌ هذا الملف لا يبدو كملف MiniBank Backup صالح.');
        return;
      }

      if (json.meta.dbName && json.meta.dbName !== DB_NAME) {
        const ok = confirm(
          `⚠️ الملف يخص قاعدة بيانات باسم "${json.meta.dbName}" وليس "${DB_NAME}". الاستمرار؟`
        );
        if (!ok) return;
      }

      const db = await openMiniBankDB();

      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);

        STORES.forEach((storeName) => {
          const store = tx.objectStore(storeName);
          store.clear();

          const incoming = (json.stores && json.stores[storeName]) || [];
          incoming.forEach((record) => {
            try {
              if (record && typeof record.id !== 'undefined') {
                store.put(record);
              } else if (record && record.key && record.value) {
                // fallback في حال كان الشكل {key, value}
                store.put(record.value, record.key);
              } else {
                store.put(record);
              }
            } catch (e) {
              console.warn(
                `[MiniBank Backup] مشكلة أثناء استيراد سجل في store ${storeName}`,
                e,
                record
              );
            }
          });
        });
      });

      alert('✅ تم استيراد البيانات بنجاح. سيتم إعادة تحميل MiniBank الآن.');
      window.location.reload();
    } catch (err) {
      console.error('[MiniBank Backup] import error:', err);
      alert('❌ فشل استيراد الملف. تأكد من صحة ملف JSON ثم جرّب مرة أخرى.');
    }
  }

  async function resetMiniBankData() {
    const ok = confirm(
      '⚠️ هذا الإجراء سيمسح جميع بيانات MiniBank من هذا المتصفح (الحساب، أفراد العائلة، الحركات، AI Insights) ولن يمكن التراجع عنه.\n\nمتأكد أنك تريد المتابعة؟'
    );
    if (!ok) return;

    try {
      const db = await openMiniBankDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES, 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        STORES.forEach((s) => tx.objectStore(s).clear());
      });

      try {
        localStorage.removeItem('miniBankTheme');
      } catch (e) {}

      alert('✅ تم مسح جميع بيانات MiniBank. سيتم إعادة تحميل التطبيق الآن.');
      window.location.reload();
    } catch (err) {
      console.error('[MiniBank Backup] reset error:', err);
      alert('❌ لم نتمكّن من عمل Reset للتطبيق. راجع الـ Console.');
    }
  }

  function wireBackupButtons() {
    const btnExport = document.getElementById('btnExportData');
    const btnImport = document.getElementById('btnImportData');
    const btnReset = document.getElementById('btnResetData');
    const fileInput = document.getElementById('importFileInput');

    if (!btnExport && !btnImport && !btnReset && !fileInput) {
      return;
    }

    if (btnExport) {
      btnExport.addEventListener('click', (e) => {
        e.preventDefault();
        exportMiniBankData();
      });
    }

    if (btnImport && fileInput) {
      btnImport.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        importMiniBankDataFromFile(file).finally(() => {
          fileInput.value = '';
        });
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        resetMiniBankData();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBackupButtons);
  } else {
    wireBackupButtons();
  }
})();

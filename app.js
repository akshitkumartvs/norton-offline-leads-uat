/* ========= SALESFORCE ENV CONFIG ========= */
const SF_ENV = "UAT"; 

const SF_CONFIG = {
   DEV: {
    BASE_URL: "https://test.salesforce.com",
    ORG_ID: "00DQ1000001wi6X"
  },
  UAT: {
    BASE_URL: "https://test.salesforce.com",
    ORG_ID: "00DS90000011ARN"
  },
  PROD: {
    BASE_URL: "https://login.salesforce.com",
    ORG_ID: "00D8d00000Apx47"
  }
};

const MODEL_CONFIG = {
  DEV: [
    { label: "Manx", id: "01tSr00000BCqJ4IAL" },
    { label: "Manx First Edition", id: "01tQ100000DYTmTIAX" },
    { label: "Manx R", id: "01tSr00000BCrWrIAL" },
    { label: "Manx R First Edition", id: "01tSr00000BCrVFIA1" },
    { label: "Atlas", id: "01tSr00000BCqKgIAL" },
    { label: "Atlas GT", id: "01tSr00000BCrbhIAD" }
  ],
  UAT: [
    { label: "Manx", id: "01tS900000FHAgtIAH" },
    { label: "Manx First Edition", id: "01tS900000FJGA7IAP" },
    { label: "Manx R", id: "01tS900000FHFq1IAH" },
    { label: "Manx R First Edition", id: "01tS900000FHFoPIAX" },
    { label: "Atlas", id: "01tS900000FHFy5IAH" },
    { label: "Atlas GT", id: "01tS900000FHFurIAH" }
  ],
  PROD: [
    { label: "Manx", id: "01tSr00000BCqJ4IAL" },
    { label: "Manx First Edition", id: "01tSr00000BEH4HIAX" },
    { label: "Manx R", id: "01tSr00000BCrWrIAL" },
    { label: "Manx R First Edition", id: "01tSr00000BCrVFIA1" },
    { label: "Atlas", id: "01tSr00000BCqKgIAL" },
    { label: "Atlas GT", id: "01tSr00000BCrbhIAD" }
  ]
};

const ACTIVE = SF_CONFIG[SF_ENV];
const WEB_TO_LEAD_URL =
  ACTIVE.BASE_URL + "/servlet/servlet.WebToLead?encoding=UTF-8";

const DB_NAME = "sfOfflineLeadsDB";
const STORE_NAME = "leads";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error("DB open failed:", request.error);
      reject(request.error);
    };
  });
}

async function addToQueue(data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const request = store.add(data);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getQueue() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");

  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromQueue(ids) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  ids.forEach(id => store.delete(id));
}

function getPendingText(count) {
  const langSelect = document.getElementById("langSelect");
  const lang = langSelect ? langSelect.value : "en";

  if (!window.I18N || !I18N[lang]) {
    return `${count} offline record(s) pending`;
  }

  return I18N[lang].pending.replace("{count}", count);
}

/* ========= OFFLINE + AUTO SYNC ========= */
(() => {

  const BATCH = 10;

  const dot = document.getElementById("dot");
  const netText = document.getElementById("netText");
  const autoToggle = document.getElementById("autoToggle");
  const pendingBar = document.getElementById("pendingBar");
  const pendingText = document.getElementById("pendingText");
  const syncBtn = document.getElementById("syncBtn");
  const form = document.getElementById("leadForm");

  form.action = WEB_TO_LEAD_URL;

  function updateUI() {
    const online = navigator.onLine;

    dot.className = "dot " + (online ? "online" : "offline");

    netText.textContent = online ? "Online" : "Offline";

    if (window.I18N) {
      netText.textContent = online
        ? I18N[document.getElementById("langSelect")?.value || "en"].online
        : I18N[document.getElementById("langSelect")?.value || "en"].offline;
    }

    getQueue()
    .then(queue => {

      const pending = queue.filter(item => item.status !== "synced");
      const count = pending.length;

      if (count > 0) {
        pendingBar.style.display = "flex";
        pendingText.textContent = getPendingText(count);
        syncBtn.style.display = navigator.onLine ? "inline" : "none";
      } else {
        pendingBar.style.display = "none";
      }

    })
    .catch(err => {
      console.error("UI load failed:", err);
    });
  }
  window.__updateOfflineUI = updateUI;

  function sendLead(data, index) {
    const iframeName = "sf_target_" + Date.now() + "_" + index;

    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const f = document.createElement("form");
    f.method = "POST";
    f.target = iframeName;
    f.action = WEB_TO_LEAD_URL;

    data.oid = ACTIVE.ORG_ID;
    data.retURL = "about:blank";

    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined) {
        const i = document.createElement("input");
        i.type = "hidden";
        i.name = k;
        i.value = v;
        f.appendChild(i);
      }
    });

    document.body.appendChild(f);
    f.submit();

    setTimeout(() => {
      f.remove();
      iframe.remove();
    }, 3000);
  }

  async function flushQueue() {
    const queue = (await getQueue()).filter(item => item.status !== "synced");
    if (!queue.length || !navigator.onLine) return;

    syncBtn.classList.add("rotating");

    const batch = queue.slice(0, BATCH);

    batch.forEach((item, i) =>
      setTimeout(() => sendLead(item, i), i * 600)
    );

    const ids = batch.map(item => item.id);
    await markAsSynced(ids);

    setTimeout(async () => {
      syncBtn.classList.remove("rotating");
      updateUI();

      const remaining = await getQueue();
      if (remaining.length) flushQueue();
    }, batch.length * 500);
  }

  const last_name = form.querySelector('input[name="last_name"]');
  last_name.addEventListener("input", () => {
    last_name.setCustomValidity("");
  });

  const phoneInput = form.querySelector('input[name="phone"]');
  phoneInput.addEventListener("input", () => {
    phoneInput.setCustomValidity("");
  });

  const emailInput = document.querySelector('input[name="email"]');
  emailInput.addEventListener("input", function () {
    this.setCustomValidity("");
  });

  form.addEventListener("submit", async e => {

    e.preventDefault();
    e.stopPropagation();

    const lang =  localStorage.getItem("lang") || document.getElementById("langSelect")?.value || "en";

    document.getElementById("sfLanguage").value = LANGUAGE_TO_SF[lang] || "English";

    const data = Object.fromEntries(new FormData(form));
    data.mode = navigator.onLine ? "online" : "offline";
    data.status = navigator.onLine ? "synced" : "pending";
    data.createdAt = Date.now();

    const requiredFields = form.querySelectorAll("[required]");
    

    for (const field of requiredFields) {
      if (!field.value.trim()) {
        field.setCustomValidity(I18N[lang].requiredField);
        field.reportValidity();
        field.focus();
        return;
      }
    }

    const emailInput = form.querySelector('input[name="email"]');
    const emailRegex = /^(?!\.)(?!.*\.\.)[^\s@]{1,64}(?<!\.)@[^\s@]+\.[^\s@]{2,}$/u;;

    if (!emailRegex.test(emailInput.value.trim())) {
      emailInput.setCustomValidity(I18N[lang].invalidEmail);
      emailInput.reportValidity();
      emailInput.focus();
      return;
    }

    const phoneInput = form.querySelector('input[name="phone"]');

    if (phoneInput.value.trim()) {

      const raw = phoneInput.value.trim();
      const digitsOnly = raw.replace(/\D/g, "");

      if (digitsOnly.length < 8 || digitsOnly.length > 15) {
        phoneInput.setCustomValidity(I18N[lang].invalidPhone);
        phoneInput.reportValidity();
        phoneInput.focus();
        return;
      }

      phoneInput.value = raw.startsWith("+")
        ? "+" + digitsOnly
        : digitsOnly;
    }

    const terms = document.getElementById("termsAccepted");

    if (!terms.checked) {
 
      terms.setCustomValidity(I18N[lang].acceptTerms);
      terms.reportValidity();
      return;
    }

    try {
      await addToQueue(data);
    } catch (err) {
      console.error("IndexedDB error:", err);

      alert("⚠️  Unable to save your enquiry! Your browser storage is unavailable. Please disable private mode or try another browser.");

      return; 
    }

    if (!navigator.onLine) {

      form.reset();
      updateUI();
      showSuccessPopup("offline");
      return;
    }

    form.target = "hidden_sf_target";

    if (!form.querySelector('[name="oid"]')) {
      const oid = document.createElement("input");
      oid.type = "hidden";
      oid.name = "oid";
      oid.value = ACTIVE.ORG_ID;
      form.appendChild(oid);
    }

    if (!form.querySelector('[name="retURL"]')) {
      const r = document.createElement("input");
      r.type = "hidden";
      r.name = "retURL";
      r.value = "about:blank";
      form.appendChild(r);
    }

    form.submit();
    form.reset();
    showSuccessPopup("online");
  });

  syncBtn.onclick = flushQueue;

  async function markAsSynced(ids) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      ids.forEach(id => {
        const req = store.get(id);

        req.onsuccess = function () {
          const data = req.result;
          if (data) {
            data.status = "synced";
            store.put(data);
          }
        };

        req.onerror = () => reject(req.error);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  window.addEventListener("online", () => {
    updateUI();
  });

  window.addEventListener("offline", updateUI);

  updateUI();
})();

function showSuccessPopup(type) {
  const lang = localStorage.getItem("lang") || "en";

  const titleKey =
    type === "offline" ? "successOfflineTitle" : "successOnlineTitle";

  const messageKey =
    type === "offline" ? "successOfflineMessage" : "successOnlineMessage";

  document.getElementById("popupTitle").textContent =
    I18N[lang][titleKey];

  document.getElementById("successMsg").textContent =
    I18N[lang][messageKey];

  document.getElementById("successPopup").style.display = "flex";
}

function closePopup() {
  document.getElementById("successPopup").style.display = "none";
}

function loadModels() {
  const select = document.querySelector(
    'select[name="Web_To_Lead_Enquiry_Model_Id__c"]'
  );

  const models = MODEL_CONFIG[SF_ENV];

  models.forEach(model => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    select.appendChild(option);
  });
}

loadModels();

/* ========= LANGUAGE ========= */

const LANGUAGE_TO_SF = {
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian"
};  

const TERMS_URL = {
  en: "https://www.nortonmotorcycles.com/en-gb/terms-conditions",
  fr: "https://www.nortonmotorcycles.com/fr-fr/terms-conditions",
  de: "https://www.nortonmotorcycles.com/de-de/terms-conditions",
  es: "https://www.nortonmotorcycles.com/es-es/terms-conditions",
  it: "https://www.nortonmotorcycles.com/it-it/terms-conditions"
};

const PRIVACY_URL = {
  en: "https://www.nortonmotorcycles.com/en-gb/privacy-policy",
  fr: "https://www.nortonmotorcycles.com/fr-fr/privacy-policy",
  de: "https://www.nortonmotorcycles.com/de-de/privacy-policy",
  es: "https://www.nortonmotorcycles.com/es-es/privacy-policy",
  it: "https://www.nortonmotorcycles.com/it-it/privacy-policy"
};

const I18N = {
  en: {
    title: "Norton Enquiry Form",
    leadDetails: "Details",
    autoSync: "Auto-sync",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone",
    enquiryModel: "Enquiry Model",
    enquiryType: "Enquiry Type",
    selectProduct: "-- Select Product --",
    selectEnquiryType: "-- Select Enquiry Type --",
    enquiry: "Enquiry",
    waitlist: "Waitlist",
    commPref: "We want you to be the first to hear the exciting news about our latest products, events and services. If you are happy for us to stay in touch, let us know your preferred methods of communication by selecting from the options below: ",
    commPref2: "I would like to receive marketing communications via",
    submit: "SUBMIT",
    online: "Online",
    offline: "Offline",
    pending: "{count} offline enquiry(s) pending",
    postalCode: "Postal Code",
    postalHint: "ZIP / PIN",
    termsBefore: "I have read, understood and agree to the ",
    termsLinkText: "Website Terms of Service",
    termsAfter: " and agree that by submitting this form The Norton Motorcycle Co. Limited may contact me using the contact details provided in relation to my request.",
    successOnlineTitle: "Submitted",
    successOnlineMessage: "Your enquiry has been submitted successfully.",
    successOfflineTitle: "Saved Offline",
    successOfflineMessage: "Your enquiry has been saved and will sync automatically when you're back online.",
    ok: "OK",
    invalidEmail: "Please enter a valid email address",
    requiredField: "This field is required",
    acceptTerms: "You must accept the Terms & Conditions",
    invalidPhone: "Please enter a valid phone number",
    privacyBefore: "You can withdraw your consent at any point by clicking unsubscribe on any marketing emails we send you, contacting us at +44 (0) 808 160 9575 or clientservices@nortonmotorcycles.com . To find out more about how we collect, use and store your data, please see our ",
    privacyLinkText: "Privacy Policy.",
    deleteWarning: "⚠ Please export all leads and ensure the exported file is safely stored on your device before deleting. If you delete all leads without a backup, they cannot be recovered later.",
    leadSummary: "Lead Summary",
    total: "Total",
    synced: "Synced",
    pendingLabel: "Pending",
    capturedOnline: "Captured Online",
    capturedOffline: "Captured Offline",
    exportLeads: "Export Leads",
    deleteAllLeads: "Delete All Leads",
    flipBtn: "FLIP",
    enterPassword: "Enter Password",
    confirmPassword: "Confirm Password",
    cancel: "Cancel",
    export: "Export",
    delete: "Delete",
    deleteConfirmTitle: "Type DELETE to confirm",
    typeDelete: "Type DELETE",
    statsLabel: "Stats",
    viewStats: "View Stats"
  },

  fr: {
    title: "Formulaire de demande Norton",
    leadDetails: "Détails de la demande",
    autoSync: "Auto-sync",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Email",
    phone: "Téléphone",
    enquiryModel: "Modèle de demande",
    enquiryType: "Type de demande",
    selectProduct: "-- Sélectionner un produit --",
    selectEnquiryType: "-- Sélectionner le type --",
    enquiry: "Demande",
    waitlist: "Liste d’attente",
    commPref: "Restez informé des produits et services du groupe Norton.",
    commPref2: "Je souhaite recevoir des informations pertinentes et des offres. Afin de recevoir des communications personnalisées, mes préférences et interactions avec les communications, produits et services du groupe Norton seront analysées. Les sociétés du groupe Norton sélectionnées et les revendeurs sélectionnés (qui fournissent des ventes, des services, des pièces approuvées et des services de réparation) peuvent me contacter à des fins de marketing, via les canaux suivants :",
    submit: "SOUMETTRE",
    online: "En ligne",
    offline: "Hors ligne",
    pending: "{count} demande(s) hors ligne en attente",
    postalCode: "Code postal",
    postalHint: "Code postal",
    termsBefore: "J'ai lu, compris et accepte les ",
    termsLinkText: "Conditions générales du site Web",
    termsAfter: " et j'accepte qu'en soumettant ce formulaire, The Norton Motorcycle Co. Limited puisse me contacter en utilisant les coordonnées fournies en rapport avec ma demande.",
    successOnlineTitle: "Envoyé",
    successOnlineMessage: "Votre demande a été envoyée avec succès.",
    successOfflineTitle: "Enregistré hors ligne",
    successOfflineMessage: "Votre demande a été enregistrée et sera synchronisée automatiquement lorsque vous serez en ligne.",
    ok: "OK",
    invalidEmail: "Veuillez saisir une adresse e-mail valide",
    requiredField: "Ce champ est obligatoire",
    acceptTerms: "Vous devez accepter les conditions générales",
    invalidPhone: "Veuillez saisir un numéro de téléphone valide",
    privacyBefore: "Vous pouvez retirer votre consentement à tout moment en cliquant sur « se désinscrire » dans l'un des e-mails marketing que nous vous envoyons, en nous contactant à +44 152 774 1520 ou clientservices@nortonmotorcycles.com . Pour en savoir plus sur la manière dont nous collectons, utilisons et stockons vos données, veuillez consulter notre ",
    privacyLinkText: "Politique de confidentialité.",
    deleteWarning: "⚠ Veuillez exporter toutes les données et vous assurer que le fichier exporté est enregistré en toute sécurité sur votre appareil avant de supprimer. Si vous supprimez les données sans sauvegarde, elles ne pourront pas être récupérées ultérieurement.",
    leadSummary: "Résumé des prospects",
    total: "Total",
    synced: "Synchronisé",
    pendingLabel: "En attente",
    capturedOnline: "Capturé en ligne",
    capturedOffline: "Capturé hors ligne",
    exportLeads: "Exporter les prospects",
    deleteAllLeads: "Supprimer tous les prospects",
    flipBtn: "FLIP",
    enterPassword: "Entrer le mot de passe",
    confirmPassword: "Confirmer le mot de passe",
    cancel: "Annuler",
    export: "Exporter",
    delete: "Supprimer",
    deleteConfirmTitle: "Tapez DELETE pour confirmer",
    typeDelete: "Tapez DELETE",
    statsLabel: "Stats",
    viewStats: "Voir les statistiques"
  },

  de: {
    title: "Norton Anfrageformular",
    leadDetails: "Anfragedetails",
    autoSync: "Auto-sync",
    firstName: "Vorname",
    lastName: "Nachname",
    email: "E-Mail",
    phone: "Telefon",
    enquiryModel: "Anfragemodell",
    enquiryType: "Anfragetyp",
    selectProduct: "-- Produkt auswählen --",
    selectEnquiryType: "-- Typ auswählen --",
    enquiry: "Anfrage",
    waitlist: "Warteliste",
    commPref: "Bleiben Sie über Produkte und Dienstleistungen der Norton Group informiert.",
    commPref2: "Ich möchte relevante Informationen und Angebote erhalten. Um personalisierte Kommunikation zu erhalten, werden meine Präferenzen und Interaktionen mit Norton Group-Kommunikationen, Produkten und Dienstleistungen analysiert. Ausgewählte Norton Group-Unternehmen und ausgewählte Händler (die Verkauf, Service, zugelassene Teile und Reparaturdienste anbieten) können mich zu Marketingzwecken über die folgenden Kanäle kontaktieren:",
    submit: "ABSENDEN",
    online: "Online",
    offline: "Offline",
    pending: "{count} Offline-Anfrage(n) ausstehend",
    postalCode: "Postleitzahl",
    postalHint: "PLZ",
    termsBefore: "Ich habe die ",
    termsLinkText: "Website-Nutzungsbedingungen",
    termsAfter: " gelesen, verstanden und stimme ihnen zu. Ich bin damit einverstanden, dass die Norton Motorcycle Co. Limited mich unter den in Bezug auf meine Anfrage angegebenen Kontaktdaten kontaktieren kann.",
    successOnlineTitle: "Gesendet",
    successOnlineMessage: "Ihre Anfrage wurde erfolgreich gesendet.",
    successOfflineTitle: "Offline gespeichert",
    successOfflineMessage: "Ihre Anfrage wurde gespeichert und wird automatisch synchronisiert, sobald Sie wieder online sind.",
    ok: "OK",
    invalidEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein",
    requiredField: "Dieses Feld ist erforderlich",
    acceptTerms: "Sie müssen die Allgemeinen Geschäftsbedingungen akzeptieren",
    invalidPhone: "Bitte geben Sie eine gültige Telefonnummer ein",
    privacyBefore: "Sie können Ihre Einwilligung jederzeit widerrufen, indem Sie auf „Abmelden“ in einer unserer Marketing-E-Mails klicken, uns unter +44 179 830 1228 oder clientservices@nortonmotorcycles.com kontaktieren. Weitere Informationen darüber, wie wir Ihre Daten erfassen, verwenden und speichern, finden Sie in unserer ",
    privacyLinkText: "Datenschutzerklärung.",
    deleteWarning: "⚠ Bitte exportieren Sie alle Daten und stellen Sie sicher, dass die exportierte Datei sicher auf Ihrem Gerät gespeichert ist, bevor Sie löschen. Wenn Sie die Daten ohne Sicherung löschen, können sie später nicht wiederhergestellt werden.",
    leadSummary: "Lead-Übersicht",
    total: "Gesamt",
    synced: "Synchronisiert",
    pendingLabel: "Ausstehend",
    capturedOnline: "Online erfasst",
    capturedOffline: "Offline erfasst",
    exportLeads: "Leads exportieren",
    deleteAllLeads: "Alle Leads löschen",
    flipBtn: "FLIP",
    enterPassword: "Passwort eingeben",
    confirmPassword: "Passwort bestätigen",
    cancel: "Abbrechen",
    export: "Exportieren",
    delete: "Löschen",
    deleteConfirmTitle: "Geben Sie DELETE ein, um zu bestätigen",
    typeDelete: "DELETE eingeben",
    statsLabel: "Statistik",
    viewStats: "Statistiken anzeigen"
  },
  es: {
    title: "Formulario de consulta Norton",
    leadDetails: "Detalles",
    autoSync: "Auto-sync",
    firstName: "Nombre",
    lastName: "Apellido",
    email: "Correo electrónico",
    phone: "Teléfono",
    enquiryModel: "Modelo de consulta",
    enquiryType: "Tipo de consulta",
    selectProduct: "-- Seleccionar producto --",
    selectEnquiryType: "-- Seleccionar tipo de consulta --",
    enquiry: "Consulta",
    waitlist: "Lista de espera",
    commPref: "Manténgase informado sobre productos y servicios del grupo Norton.",
    commPref2: "Me gustaría recibir información relevante y ofertas. Para recibir comunicaciones personalizadas, mis preferencias e interacciones con las comunicaciones, productos y servicios del Grupo Norton serán analizadas. Las empresas seleccionadas del Grupo Norton y los concesionarios seleccionados (que proporcionan ventas, servicio, piezas aprobadas y servicios de reparación) pueden contactarme con fines de marketing, a través de los siguientes canales:",
    submit: "ENVIAR",
    online: "En línea",
    offline: "Sin conexión",
    pending: "{count} consulta(s) sin conexión pendiente(s)",
    postalCode: "Código postal",
    postalHint: "Código postal",
    termsBefore: "He leído, entendido y acepto los ",
    termsLinkText: "Términos de Servicio del Sitio Web",
    termsAfter: " y acepto que al enviar este formulario, The Norton Motorcycle Co. Limited puede contactarme utilizando los datos de contacto proporcionados en relación con mi solicitud.",
    successOnlineTitle: "Enviado",
    successOnlineMessage: "Tu consulta se ha enviado correctamente.",
    successOfflineTitle: "Guardado sin conexión",
    successOfflineMessage: "Tu consulta se ha guardado y se sincronizará automáticamente cuando vuelvas a estar en línea.",
    ok: "OK",
    invalidEmail: "Por favor, introduce una dirección de correo electrónico válida",
    requiredField: "Este campo es obligatorio",
    acceptTerms: "Debes aceptar los Términos y Condiciones",
    invalidPhone: "Por favor, introduce un número de teléfono válido",
    privacyBefore: "Puede retirar su consentimiento en cualquier momento haciendo clic en cancelar suscripción en cualquier correo electrónico de marketing que le enviemos, contactándonos en +44 172 764 8499 o clientservices@nortonmotorcycles.com . Para obtener más información sobre cómo recopilamos, usamos y almacenamos sus datos, consulte nuestra ",
    privacyLinkText: "Política de privacidad.",
    deleteWarning: "⚠ Por favor exporte todos los datos y asegúrese de que el archivo exportado esté guardado de forma segura en su dispositivo antes de eliminar. Si elimina los datos sin copia de seguridad, no podrán recuperarse posteriormente.",
    leadSummary: "Resumen de leads",
    total: "Total",
    synced: "Sincronizado",
    pendingLabel: "Pendiente",
    capturedOnline: "Capturado en línea",
    capturedOffline: "Capturado sin conexión",
    exportLeads: "Exportar leads",
    deleteAllLeads: "Eliminar todos los leads",
    flipBtn: "FLIP",
    enterPassword: "Ingrese la contraseña",
    confirmPassword: "Confirmar contraseña",
    cancel: "Cancelar",
    export: "Exportar",
    delete: "Eliminar",
    deleteConfirmTitle: "Escriba DELETE para confirmar",
    typeDelete: "Escriba DELETE",
    statsLabel: "Estadísticas",
    viewStats: "Ver estadísticas"

  },
  it: {
    title: "Modulo di richiesta Norton",
    leadDetails: "Dettagli",
    autoSync: "Auto-sync",
    firstName: "Nome",
    lastName: "Cognome",
    email: "Email",
    phone: "Telefono",
    enquiryModel: "Modello di richiesta",
    enquiryType: "Tipo di richiesta",
    selectProduct: "-- Seleziona prodotto --",
    selectEnquiryType: "-- Seleziona tipo di richiesta --",
    enquiry: "Richiesta",
    waitlist: "Lista d’attesa",
    commPref: "Rimani aggiornato su prodotti e servizi del gruppo Norton.",
    commPref2: "Vorrei ricevere informazioni e offerte rilevanti. Per ricevere comunicazioni personalizzate, le mie preferenze e interazioni con le comunicazioni, i prodotti e i servizi del Gruppo Norton saranno analizzate. Le società selezionate del Gruppo Norton e i rivenditori selezionati (che forniscono vendita, assistenza, parti approvate e servizi di riparazione) possono contattarmi per scopi di marketing tramite i seguenti canali:",
    submit: "INVIA",
    online: "Online",
    offline: "Offline",
    pending: "{count} richiesta/e offline in attesa",
    postalCode: "Codice postale",
    postalHint: "CAP",
    termsBefore: "Ho letto, compreso e accetto i ",
    termsLinkText: "Termini di Servizio del Sito Web",
    termsAfter: " e accetto che, inviando questo modulo, The Norton Motorcycle Co. Limited possa contattarmi utilizzando i dati di contatto forniti in relazione alla mia richiesta.",
    successOnlineTitle: "Inviata",
    successOnlineMessage: "La tua richiesta è stata inviata con successo.",
    successOfflineTitle: "Salvata offline",
    successOfflineMessage: "La tua richiesta è stata salvata e verrà sincronizzata automaticamente quando tornerai online.",
    ok: "OK",
    invalidEmail: "Inserisci un indirizzo email valido",
    requiredField: "Questo campo è obbligatorio",
    acceptTerms: "Devi accettare i Termini e Condizioni",
    invalidPhone: "Inserisci un numero di telefono valido",
    privacyBefore: "Puoi revocare il tuo consenso in qualsiasi momento facendo clic su annulla iscrizione in una delle email di marketing che ti inviamo, contattandoci al numero +44 163 498 0738 o all'indirizzo clientservices@nortonmotorcycles.com . Per ulteriori informazioni su come raccogliamo, utilizziamo e memorizziamo i tuoi dati, consulta la nostra ",
    privacyLinkText: "Informativa sulla privacy.",
    deleteWarning: "⚠ Si prega di esportare tutti i dati e assicurarsi che il file esportato sia salvato in modo sicuro sul dispositivo prima di eliminare. Se si eliminano i dati senza backup, non sarà possibile recuperarli successivamente.",
    leadSummary: "Riepilogo lead",
    total: "Totale",
    synced: "Sincronizzato",
    pendingLabel: "In attesa",
    capturedOnline: "Acquisito online",
    capturedOffline: "Acquisito offline",
    exportLeads: "Esporta lead",
    deleteAllLeads: "Elimina tutti i lead",
    flipBtn: "FLIP",
    enterPassword: "Inserisci password",
    confirmPassword: "Conferma password",
    cancel: "Annulla",
    export: "Esporta",
    delete: "Elimina",
    deleteConfirmTitle: "Digita DELETE per confermare",
    typeDelete: "Digita DELETE",
    statsLabel: "Statistiche",
    viewStats: "Visualizza statistiche"
  }
  
};


const langSelect = document.getElementById("langSelect");
const netText2 = document.getElementById("netText");

function applyLanguage(lang) {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = I18N[lang][el.dataset.i18n];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    el.placeholder = I18N[lang][key] || "";
  });

  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.dataset.i18nTitle;
    el.title = I18N[lang][key] || "";
  });
  document.title = I18N[lang].title;

  netText2.textContent = navigator.onLine
    ? I18N[lang].online
    : I18N[lang].offline;

  const link = document.getElementById("termsLink");
  if (link && TERMS_URL[lang]) {
    link.href = TERMS_URL[lang];
  }

  const privacyLink = document.getElementById("privacyLink");
  if (privacyLink && PRIVACY_URL[lang]) {
    privacyLink.href = PRIVACY_URL[lang];
  }

  localStorage.setItem("lang", lang);
}

langSelect.addEventListener("change", e => {
  applyLanguage(e.target.value);
  if (window.__updateOfflineUI) {
    window.__updateOfflineUI();
  }
});

window.I18N = I18N;

const savedLang = localStorage.getItem("lang") || "en";
langSelect.value = savedLang;
applyLanguage(savedLang);

window.addEventListener("online", () => applyLanguage(langSelect.value));
window.addEventListener("offline", () => applyLanguage(langSelect.value));

if (window.__updateOfflineUI) {
  window.__updateOfflineUI();
}

const statsToggle = document.getElementById("statsToggle");
const cardFlip = document.getElementById("cardFlip");
const backBtn = document.getElementById("backBtn");

if (statsToggle && cardFlip && backBtn) {

  statsToggle.addEventListener("click", async () => {
    await loadStats();   // load data first
    cardFlip.classList.add("flipped");  // flip card
  });

  backBtn.addEventListener("click", () => {
    cardFlip.classList.remove("flipped"); // flip back
  });

}

async function loadStats() {
  try {
    const data = await getQueue();   // IndexedDB

    const total = data.length;

    const synced = data.filter(d => d.status === "synced").length;

    const pending = data.filter(d => d.status !== "synced").length;

    const online = data.filter(d => d.mode === "online").length;

    const offline = data.filter(d => d.mode === "offline").length;

    // Update UI
    document.getElementById("totalCount").textContent = total;
    document.getElementById("syncedCount").textContent = synced;
    document.getElementById("pendingCount").textContent = pending;
    document.getElementById("onlineCount").textContent = online;
    document.getElementById("offlineCount").textContent = offline;

  } catch (err) {
    console.error("Stats error:", err);
    alert("Failed to load stats");
  }
}
function openExportModal() {
   document.getElementById("exportModal").style.display = "flex";
}

function closeExportModal() {
  document.getElementById("exportModal").style.display = "none";
}

function openDeleteModal() {
  document.getElementById("deleteModal").style.display = "flex";
  const input = document.getElementById("deleteConfirmText");
  input.value = "";
  setTimeout(() => input.focus(), 100);
}

function closeDeleteModal() {
  document.getElementById("deleteModal").style.display = "none";
}
function convertToCSV(data) {
  if (!data.length) return "";

  const headers = Object.keys(data[0]);

  const csvRows = [];

  csvRows.push(headers.join(","));


  data.forEach(row => {
    const values = headers.map(field => {
      let val = row[field] ?? "";

      val = String(val).replace(/"/g, '""');

      return `"${val}"`;
    });

    csvRows.push(values.join(","));
  });

  return csvRows.join("\n");
}

async function exportLeads() {
  const password = document.getElementById("exportPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (!password || !confirmPassword) {
    alert("Please enter password");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match");
    return;
  }

  try {
    const leads = await getQueue();

    if (!leads.length) {
      alert("No leads to export");
      return;
    }

    const csvData = convertToCSV(leads);

    const { encrypted, salt, iv } = encryptWithPBKDF2(csvData, password);

   const finalData = JSON.stringify({
      salt: salt,
      iv: iv,
      data: encrypted
    });

    /*const blob = new Blob([encrypted], { type: "application/octet-stream" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `norton_leads_${Date.now()}.enc`;

    link.click();*/

     const blob = new Blob([encrypted], { type: "application/octet-stream" });

      const reader = new FileReader();
      
      reader.onload = function () {
        const link = document.createElement("a");
        link.href = reader.result;
        link.download = "norton_leads$_{Date.now()}.enc";
        link.click();
      };


    closeExportModal();
    document.getElementById("exportPassword").value = "";
    document.getElementById("confirmPassword").value = "";

  } catch (err) {
    console.error("Export failed:", err);
    alert("Export failed");
  }
}
function encryptWithPBKDF2(data, password) {
  const salt = CryptoJS.lib.WordArray.random(128 / 8);

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000
  });

  const iv = CryptoJS.lib.WordArray.random(128 / 8);

  const encrypted = CryptoJS.AES.encrypt(data, key, {
    iv: iv
  }).toString();

  return {
    encrypted,
    salt: salt.toString(),
    iv: iv.toString()
  };
}
async function clearAllLeads() {
  const confirmText = document.getElementById("deleteConfirmText").value;

  if (confirmText !== "DELETE") {
    alert("Type DELETE to confirm");
    return;
  }

  try {
    const db = await openDB();

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const request = store.clear();

    request.onsuccess = async () => {

      document.getElementById("deleteConfirmText").value = "";

      closeDeleteModal();

      if (window.__updateOfflineUI) {
        window.__updateOfflineUI();
      }

      if (typeof loadStats === "function") {
        await loadStats();
      }

      alert("All leads deleted successfully");
    };

    request.onerror = () => {
      alert("Failed to delete leads");
    };

  } catch (err) {
    console.error("Delete error:", err);
    alert("Error deleting leads");
  }
}

import { offers, initialApplications, defaultLetter, cv } from "./fixtures.mjs";

const paths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/>',
  layers:
    '<rect x="5" y="7" width="15" height="14" rx="2"/><path d="M16 7V3H3v14h2M9 12h7M9 16h5"/>',
  file: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  back: '<path d="M19 12H5M10 7l-5 5 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2"/>',
  send: '<path d="m21 3-7 18-4-7-7-4zM10 14 21 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  external: '<path d="M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4M18 4h4"/>',
  copy: '<rect x="7" y="7" width="14" height="14" rx="2"/><path d="M16 7V3H3v13h4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.file}</svg>`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const main = document.querySelector("main"),
  dialog = document.querySelector("dialog");
let applications = structuredClone(initialApplications),
  decisions = {},
  selectedOffer = offers[0].id;
let scenario = "normal",
  search = "",
  category = "all",
  sort = "score",
  offerBucket = "pending",
  toastTimer,
  previousFocus;
const drafts = new Map();
const labels = {
  dashboard: "Tableau de bord",
  offers: "Offres",
  applications: "Candidatures",
  documents: "Mes documents",
  dossier: "Dossier candidature",
  activity: "Activité IA",
};
const statusLabel = (status) =>
  ({
    draft: "À préparer",
    waiting: "En attente de réponse",
    interview: "Entretien prévu",
    responded: "Réponse reçue",
    refused: "Refus reçu",
    offer: "Proposition reçue",
  })[status];
const statusBadge = (status) =>
  `<span class="badge ${status === "interview" ? "violet" : status === "waiting" ? "green" : "amber"}">${statusLabel(status)}</span>`;
const btn = (text, action, primary = false, extra = "") =>
  `<button type="button" class="button ${primary ? "primary" : ""}" data-action="${action}" ${extra}>${text}</button>`;
const company = (item) =>
  `<div class="company-cell"><span class="company-avatar ${item.color ?? "violet"}">${esc(item.initials)}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.company)} <span class="mobile-only">${esc(item.location)}</span></small></div></div>`;
const score = (item) =>
  `<span class="score">${item.score}%<span class="score-track"><i style="width:${item.score}%"></i></span></span>`;
const go = (route) => {
  if (location.hash === `#${route}`) render();
  else location.hash = route;
};
const currentRoute = () => {
  const [name, id, tab] = location.hash.slice(1).split("/");
  return {
    name: labels[name] ? name : "dashboard",
    id,
    tab: ["prepare", "follow", "offer"].includes(tab) ? tab : "prepare",
  };
};
const latestDraft = (id) =>
  drafts.get(id) ?? applications.find((app) => app.id === id)?.letter ?? "";
function toast(message) {
  const el = document.querySelector("#toast");
  clearTimeout(toastTimer);
  el.textContent = message;
  el.hidden = false;
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 6000);
}
function openDialog(content, preview = false) {
  previousFocus = document.activeElement;
  dialog.classList.toggle("preview-dialog", preview);
  document.querySelector("#dialog-content").innerHTML = content;
  dialog.showModal();
}
function closeDialog() {
  dialog.close();
  previousFocus?.focus();
}
dialog.addEventListener("close", () => previousFocus?.focus());
function filteredOffers() {
  return offers
    .filter(
      (item) =>
        (decisions[item.id] ?? "pending") === offerBucket &&
        (category === "all" || item.category === category) &&
        `${item.company} ${item.title} ${item.location}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "score" ? b.score - a.score : b.date.localeCompare(a.date, "fr"),
    );
}
function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function dashboard() {
  const waiting = applications.filter(
    (a) => a.sent && a.status === "waiting",
  ).length;
  const interviews = applications.filter(
    (a) => a.status === "interview",
  ).length;
  const pending = offers.filter((item) => !decisions[item.id]);
  const draft = applications.find((app) => app.status === "draft");
  return (
    heading(
      "Tableau de bord",
      "Ce qui compte pour ta recherche, aujourd’hui.",
      `<select class="field" style="width:auto" aria-label="Période des envois"><option>30 derniers jours</option><option>Ce mois-ci</option></select>`,
    ) +
    `
    <section class="kpis" aria-label="Indicateurs de suivi">
      ${[
        [
          "Envoyées",
          applications.filter((a) => a.sent).length,
          "Sur les 30 derniers jours",
          "send",
        ],
        ["En attente", waiting, "Candidatures sans réponse", "clock"],
        [
          "Entretiens à venir",
          interviews,
          "Prochain : jeudi 15 octobre",
          "calendar",
        ],
        ["Relances dues", 1, "Une action pour aujourd’hui", "activity"],
      ]
        .map(
          ([title, value, detail, symbol]) =>
            `<div class="kpi"><div class="kpi-label">${title}${icon(symbol)}</div><p class="kpi-value">${value}</p><p class="kpi-meta">${detail}</p></div>`,
        )
        .join("")}
    </section>
    <div class="section-heading"><h2>À faire aujourd’hui <span class="count">${draft ? 3 : 2}</span></h2><a href="#applications">Mes candidatures ${icon("arrow")}</a></div>
    <section class="today-layout" aria-label="Actions et prochain entretien">
      <div class="panel">
        <div class="task-row"><span class="task-icon amber">${icon("send")}</span><div><strong>Relancer Méridien Services</strong><small>Développeur fullstack · candidature du 9 oct.</small></div><a class="button" href="#dossier/meridian/follow">Ouvrir ${icon("arrow")}</a></div>
        ${draft ? `<div class="task-row"><span class="task-icon">${icon("file")}</span><div><strong>Terminer ma candidature</strong><small>${esc(draft.company)} · lettre en préparation</small></div><a class="button" href="#dossier/${draft.id}/prepare">Reprendre</a></div>` : `<div class="task-row"><span class="task-icon">${icon("briefcase")}</span><div><strong>Examiner les nouvelles offres</strong><small>${pending.length} propositions à lire</small></div><a class="button" href="#offers">Voir ${icon("arrow")}</a></div>`}
      </div>
      <div class="panel"><div class="panel-heading"><h2>Prochain entretien</h2><span class="badge violet">Dans 2 jours</span></div><div class="appointment"><div class="day-block"><strong>15</strong><span>OCT.</span></div><div><h3>Clair Conseil</h3><p>Développeur BI / Power Platform<br>Visioconférence · heure à confirmer</p><a class="quiet" href="#dossier/clair/follow">Préparer l’entretien ${icon("arrow")}</a></div></div></div>
    </section>
    <div class="section-heading"><h2>Offres à examiner <span class="count">${pending.length}</span></h2><a href="#offers">Toutes les offres ${icon("arrow")}</a></div>
    <section class="panel" aria-label="Propositions quotidiennes"><table class="offer-table"><thead><tr><th>Poste / entreprise</th><th class="optional-column">Lieu</th><th>Correspondance</th><th><span class="muted">Action</span></th></tr></thead><tbody>${pending.map((item) => `<tr><td>${company(item)}<span class="mobile-only mobile-score">${item.score}% · score de veille</span></td><td class="optional-column muted">${esc(item.location)}</td><td>${score(item)}</td><td>${btn(`Examiner ${icon("arrow")}`, `examine:${item.id}`)}</td></tr>`).join("")}</tbody></table><p class="table-note">Scores de veille fictifs · critères et réserves à vérifier dans chaque offre.</p></section>
    <section class="recent"><div class="section-heading"><h2>Activité récente</h2></div>${applications.flatMap((app) => app.history.slice(0, 1).map((event) => `<a class="recent-item" href="#dossier/${app.id}/follow"><span class="recent-dot"></span><span><strong>${esc(app.company)}</strong> · ${esc(event.title)}</span><small>${app.date}</small></a>`)).join("")}</section>`
  );
}
function offerDetail(item) {
  return `<aside class="panel detail-panel" aria-label="Détails de l’offre sélectionnée"><span class="company-avatar ${item.color}">${esc(item.initials)}</span><h2>${esc(item.title)}</h2><p>${esc(item.company)} · ${esc(item.location)}</p><div class="detail-score"><strong>${item.score}%</strong><div><b>Correspondance proposée</b><small>Veille du ${item.date} · à vérifier</small></div></div><h3>Ce qui correspond</h3><ul class="match-list">${item.matches.map((value) => `<li>${icon("check")}${esc(value)}</li>`).join("")}</ul><h3>À vérifier</h3><ul class="match-list unknown">${item.unknowns.map((value) => `<li>${icon("info")}${esc(value)}</li>`).join("")}</ul>${btn(`Préparer ma candidature ${icon("arrow")}`, `prepare:${item.id}`, true)}<div class="actions">${btn("Plus tard", `later:${item.id}`)}${btn("Écarter", `reject:${item.id}`)}</div><button type="button" class="button full-width spacer" data-action="external">${icon("external")} Ouvrir l’annonce</button><details><summary>Lire l’annonce</summary><p class="offer-description">${esc(item.text)}</p></details><details><summary>Comment lire ce score ?</summary><p class="offer-description">Exemple fictif de score provenant de la veille quotidienne. Les correspondances et les réserves sont conservées avec l’annonce. Ce score n’est ni une évaluation confirmée dans JobPilot, ni une probabilité d’embauche.</p></details></aside>`;
}
function offersPage() {
  const list = filteredOffers(),
    selected = list.find((item) => item.id === selectedOffer) ?? list[0];
  if (selected) selectedOffer = selected.id;
  return (
    heading(
      "Offres",
      "Choisir les postes qui méritent une candidature.",
      btn(`${icon("plus")} Ajouter une offre`, "add-offer"),
    ) +
    `<div class="segmented" aria-label="État des offres">${[
      ["pending", "À examiner"],
      ["later", "Plus tard"],
      ["prepared", "En préparation"],
      ["rejected", "Écartées"],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" data-bucket="${value}" aria-pressed="${value === offerBucket}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="filters"><input class="field search" id="search" type="search" placeholder="Rechercher un poste ou une entreprise" aria-label="Rechercher les offres" value="${esc(search)}"><select class="field" id="category" aria-label="Filtrer par métier">${["all", "Backend", "Data", "Power Platform"].map((value) => `<option value="${value}" ${value === category ? "selected" : ""}>${value === "all" ? "Tous les métiers" : value}</option>`).join("")}</select><select class="field" id="sort" aria-label="Trier les offres"><option value="score" ${sort === "score" ? "selected" : ""}>Score décroissant</option><option value="date" ${sort === "date" ? "selected" : ""}>Plus récentes</option></select></div>${list.length ? `<div class="offers-layout"><section class="offer-list" aria-label="Liste des offres">${list.map((item) => `<article class="offer-card ${item.id === selectedOffer ? "selected" : ""}"><button type="button" class="offer-select" data-action="select:${item.id}" aria-pressed="${item.id === selectedOffer}"><div class="company-cell"><span class="company-avatar ${item.color}">${esc(item.initials)}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.company)}</small></div>${score(item)}</div><div class="offer-meta"><span>${esc(item.location)}</span><span>·</span><span>${esc(item.contract)}</span><span class="badge">${esc(item.salary)}</span></div></button><div class="offer-card-footer"><span>${esc(item.source)} · ${esc(item.date)}</span><span>${item.unknowns.length} point${item.unknowns.length > 1 ? "s" : ""} à vérifier</span></div></article>`).join("")}</section>${offerDetail(selected)}</div>` : emptyState("Aucune offre dans cette vue", "Change les filtres ou retrouve les offres conservées pour plus tard.")}`
  );
}
function applicationsPage() {
  return (
    heading(
      "Candidatures",
      "Les dossiers en cours et leur prochaine étape.",
      btn(`${icon("plus")} Depuis une offre`, "open-offers"),
    ) +
    `<section class="panel"><table class="offer-table"><thead><tr><th>Poste / entreprise</th><th>Situation</th><th class="optional-column">Prochaine étape</th><th>Action</th></tr></thead><tbody>${applications.map((app) => `<tr><td>${company(app)}<span class="mobile-only spacer">${statusBadge(app.status)}</span></td><td>${statusBadge(app.status)}</td><td class="optional-column muted">${esc(app.next)}</td><td><a class="button" href="#dossier/${app.id}/${app.status === "draft" ? "prepare" : "follow"}">${app.status === "draft" ? "Préparer" : "Suivre"} ${icon("arrow")}</a></td></tr>`).join("")}</tbody></table></section>`
  );
}
function documentPreview(letter = false, app) {
  if (letter)
    return `<div class="paper-mini"><strong>Alex Martin</strong><p>alex.martin@example.com · Paris</p><div class="rule"></div><strong>Candidature — ${esc(app.title)}</strong>${esc(
      latestDraft(app.id) || "Ta lettre apparaîtra ici.",
    )
      .split("\n\n")
      .map((text) => `<p>${text.replaceAll("\n", "<br>")}</p>`)
      .join("")}</div>`;
  return `<div class="paper-mini"><strong>Alex Martin</strong><p>${esc(cv.title)}</p><div class="rule"></div><strong>Présentation</strong><p>${esc(cv.summary)}</p><strong>Compétences</strong><p>${cv.skills.join("<br>")}</p><strong>Projets</strong><p>${cv.projects.join("<br>")}</p><strong>Formation</strong><p>${esc(cv.education)}</p></div>`;
}
function prepareTab(app) {
  const letter = latestDraft(app.id),
    dirty = drafts.has(app.id),
    original = offers.find((item) => item.id === app.sourceOffer);
  return `<div class="prepare-layout"><div><section class="panel document-section"><div class="document-section-heading"><h2><span class="step">1</span> Mon CV</h2><span class="badge green">Original sélectionné</span></div><div class="file-row"><span class="file-icon">PDF</span><div><strong>${cv.name}</strong><small>${cv.size} · importé le 10 oct.</small></div>${btn(`${icon("eye")} Aperçu`, "preview-cv")}</div><div class="actions spacer">${btn(`${icon("download")} Télécharger le CV`, "download-cv")}${btn("Changer de CV", "change-cv")}</div><p class="support">Ton fichier original sera utilisé. Adapter le CV reste facultatif.</p></section>
  <section class="panel document-section"><div class="document-section-heading"><h2><span class="step">2</span> Ma lettre</h2><span class="badge ${dirty ? "amber" : letter ? "green" : ""}">${dirty ? "Brouillon non enregistré" : letter ? "Enregistrée dans le prototype" : "Facultative"}</span></div><div class="editor-toolbar">${btn(`${icon("spark")} Proposer avec l’IA`, "generate")}${btn(`${icon("eye")} Aperçu`, "preview-letter")}<span class="save-label" id="save-label">${dirty ? "Modifications à conserver" : "Tu peux écrire directement ci-dessous"}</span></div><label class="skip" for="letter">Texte de ma lettre</label><textarea class="field letter-editor" id="letter" placeholder="Rédige ta lettre, ou demande une proposition à vérifier.">${esc(letter)}</textarea><div class="actions spacer">${btn("Conserver mon brouillon", "save-letter", true)}${btn(`${icon("copy")} Copier le texte`, "copy-letter", false, letter ? "" : "disabled")}${btn("Télécharger PDF", "download-letter-pdf", false, letter ? "" : "disabled")}${btn("Télécharger DOCX", "download-letter-docx", false, letter ? "" : "disabled")}</div><details><summary>Coordonnées et mise en page</summary><div class="form-grid"><label>Nom<input class="field" value="Alex Martin" readonly></label><label>Destinataire<input class="field" value="${esc(app.company)}" readonly></label><label>Police<input class="field" value="Calibri / Carlito · 11 pt" readonly></label><label>Marges<input class="field" value="20 mm" readonly></label></div><p class="support">Présentation à valider. Les champs seront modifiables dans la version intégrée.</p></details><p class="support">PDF et DOCX : exemples fictifs fixes. Le texte corrigé est conservé dans cette session uniquement.</p></section></div>
  <aside class="dossier-side"><section class="panel next-action"><h3>La prochaine étape</h3><p>${app.sent ? "L’envoi fictif est enregistré. Retrouve la suite dans le suivi." : "Récupère tes documents, puis postule sur le site de l’employeur."}</p>${btn(`${icon("external")} Ouvrir l’annonce`, "external")}${btn(`${icon("check")} J’ai envoyé ma candidature`, "confirm-send", true, app.sent ? "disabled" : "")}</section><section class="panel next-action"><h3>Mon dossier</h3><ul class="checklist"><li>${icon("check")} CV original sélectionné</li><li>${icon(letter ? "check" : "info")} ${letter ? "Lettre rédigée · à vérifier" : "Lettre facultative"}</li><li>${icon("info")} ${app.sent ? "Envoi confirmé" : "Envoi à confirmer par toi"}</li></ul></section><section class="panel preview-box"><h3>${letter ? "Aperçu de la lettre" : "Mon CV original"}</h3><div id="mini-preview">${documentPreview(Boolean(letter), app)}</div><p class="preview-note">Aperçu de présentation fictif.</p>${btn(`${icon("eye")} Agrandir`, letter ? "preview-letter" : "preview-cv")}</section>${original ? `<section class="panel next-action"><h3>${original.score}% · Score de veille</h3><p>${esc(original.unknowns.join(" · "))}</p><a class="quiet" href="#dossier/${app.id}/offer">Revoir l’annonce ${icon("arrow")}</a></section>` : ""}</aside></div>`;
}
function followTab(app) {
  return `<div class="prepare-layout"><section class="panel document-section"><div class="document-section-heading"><h2>Historique de la candidature</h2>${statusBadge(app.status)}</div><ol class="timeline">${app.history.map((event) => `<li><strong>${esc(event.title)}</strong><p>${esc(event.detail)}</p></li>`).join("")}</ol><div class="actions spacer">${btn(`${icon("plus")} Ajouter une réponse`, "add-response")}${btn(`${icon("calendar")} Planifier un entretien`, "plan-interview")}</div></section><aside class="dossier-side"><section class="panel next-action"><h3>Prochaine action</h3><p>${esc(app.next)}</p>${btn("Préparer une relance", "reminder")}</section><section class="panel next-action"><h3>Documents utilisés</h3><p>${app.sent ? `${cv.name}${app.submittedLetter ? " · Lettre fictive" : ""}` : "Ils seront précisés lors de la confirmation de l’envoi."}</p><a class="quiet" href="#dossier/${app.id}/prepare">Voir mes documents ${icon("arrow")}</a></section></aside></div>`;
}
function dossier(route) {
  const app = applications.find((item) => item.id === route.id);
  if (!app)
    return (
      heading(
        "Dossier introuvable",
        "Retrouve les candidatures conservées dans cette session.",
      ) + `<a class="button" href="#applications">Mes candidatures</a>`
    );
  const offer = offers.find((item) => item.id === app.sourceOffer);
  return `<a class="back-link" href="#applications">${icon("back")} Mes candidatures</a><div class="dossier-heading"><span class="company-avatar">${esc(app.initials)}</span><div><h1>${esc(app.title)}</h1><p>${esc(app.company)} · ${esc(app.location)}</p></div>${statusBadge(app.status)}</div><div class="tabs" role="tablist" aria-label="Dossier candidature">${[
    ["prepare", "Préparer"],
    ["follow", "Suivi"],
    ["offer", "Annonce"],
  ]
    .map(
      ([value, label]) =>
        `<button role="tab" id="tab-${value}" aria-selected="${value === route.tab}" tabindex="${value === route.tab ? 0 : -1}" aria-controls="tab-panel" data-action="tab:${value}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div id="tab-panel" role="tabpanel" aria-labelledby="tab-${route.tab}">${route.tab === "prepare" ? prepareTab(app) : route.tab === "follow" ? followTab(app) : `<section class="panel document-section"><div class="document-section-heading"><h2>L’annonce conservée</h2>${btn(`${icon("external")} Ouvrir le site`, "external")}</div><p class="offer-description">${esc(offer?.text ?? "Texte de l’annonce non conservé pour cet exemple historique. Aucune information n’a été reconstruite.")}</p>${offer ? `<p class="hint spacer">Source fictive : ${esc(offer.url)} · vérifiée le 13 octobre 2026.</p>` : ""}</section>`}</div>`;
}
function documentsPage() {
  return (
    heading(
      "Mes documents",
      "Ton CV de référence et les lettres de tes candidatures.",
    ) +
    `<section class="panel document-section"><div class="document-section-heading"><h2>Mon CV de référence</h2><span class="badge green">Original importé</span></div><div class="file-row"><span class="file-icon">PDF</span><div><strong>${cv.name}</strong><small>${cv.size} · ${cv.date}</small></div>${btn(`${icon("eye")} Aperçu`, "preview-cv")}</div><div class="actions spacer">${btn(`${icon("download")} Télécharger l’original`, "download-cv")}${btn("Importer un autre CV", "change-cv")}</div></section><section class="panel document-section"><h2>Lettres par candidature</h2>${
      applications
        .filter((app) => app.letter || drafts.has(app.id))
        .map(
          (app) =>
            `<div class="recent-item">${icon("file")}<div><strong>${esc(app.company)}</strong><small> · ${esc(app.title)}</small></div><a class="button" style="margin-left:auto" href="#dossier/${app.id}/prepare">Modifier</a></div>`,
        )
        .join("") ||
      '<p class="muted spacer">Tes lettres apparaîtront ici après préparation d’un dossier.</p>'
    }</section>`
  );
}
function activityPage() {
  return (
    heading(
      "Activité IA",
      "Comprendre les appels, leurs résultats et leurs coûts.",
    ) +
    `<div class="state-error"><strong>Exemple de diagnostic fictif</strong>Aucun appel fournisseur n’est effectué par ce prototype.</div><section class="panel"><div class="panel-heading"><h2>Derniers appels</h2><span class="hint">Exemples de présentation</span></div><article class="activity-row"><div><strong>Proposition de lettre</strong><p>13 oct. · Mistral · modèle de démonstration</p><details><summary>Comprendre le refus</summary><p>HTTP 403 · permissions insuffisantes (exemple simulé).</p><p>Vérifier les droits de la clé et de son organisation. Le statut seul ne prouve pas un manque de crédits.</p><code>Référence : exemple-fictif-403</code><p>Aucun nouvel essai automatique. Le brouillon est conservé.</p></details></div><div><span class="badge amber">Refus du fournisseur</span><p>Coût inconnu</p></div></article><article class="activity-row"><div><strong>Ancienne analyse du CV</strong><p>10 oct. · Mistral · modèle historique</p><p>Diagnostic non conservé.</p></div><div><span class="badge">Erreur historique</span><p>Coût inconnu</p></div></article></section>`
  );
}
function emptyState(
  title = "Ta recherche commence ici",
  detail = "Ajoute une offre ou attends les prochaines propositions quotidiennes.",
) {
  return `<section class="panel empty">${icon("briefcase")}<h2>${title}</h2><p>${detail}</p>${btn(`${icon("plus")} Ajouter une offre`, "add-offer")}</section>`;
}
function render() {
  const route = currentRoute();
  document.querySelector("#crumb").textContent = labels[route.name];
  document.title = `JobPilot · ${labels[route.name]} · Prototype`;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active =
      link.dataset.nav ===
      (route.name === "dossier" ? "applications" : route.name);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelector("#offer-count").textContent = offers.filter(
    (item) => !decisions[item.id],
  ).length;
  const pages = {
    dashboard,
    offers: offersPage,
    applications: applicationsPage,
    documents: documentsPage,
    activity: activityPage,
    dossier: () => dossier(route),
  };
  main.innerHTML =
    scenario === "empty"
      ? heading(labels[route.name], "Aucun élément dans cet exemple.") +
        emptyState()
      : scenario === "loading"
        ? heading(labels[route.name], "Chargement des informations…") +
          `<div class="panel empty" role="status" aria-label="Chargement en cours">${[90, 70, 85, 60].map((width) => `<div class="loading-bar" style="width:${width}%"></div>`).join("")}<p>Simulation de chargement · utilise le sélecteur d’état pour continuer.</p></div>`
        : `${scenario === "error" ? '<div class="state-error" role="alert"><strong>Synchronisation indisponible — exemple simulé</strong>Les données et brouillons affichés sont conservés. <button type="button" class="button" data-action="recover">Synchroniser</button></div>' : ""}${pages[route.name]()}`;
}
function prepare(id) {
  const existing = applications.find((app) => app.sourceOffer === id);
  if (existing) {
    go(`dossier/${existing.id}/prepare`);
    return;
  }
  const item = offers.find((offer) => offer.id === id);
  if (!item) return;
  const app = {
    id: `draft-${id}`,
    company: item.company,
    initials: item.initials,
    title: item.title,
    location: item.location,
    status: "draft",
    sent: false,
    date: "13 oct.",
    next: "Préparer mes documents",
    letter: "",
    letterSaved: false,
    history: [
      {
        title: "Préparation commencée",
        detail: "13 octobre · offre conservée · aucun envoi",
      },
    ],
    sourceOffer: id,
  };
  applications.unshift(app);
  decisions[id] = "prepared";
  go(`dossier/${app.id}/prepare`);
}
function previewCv() {
  openDialog(
    `<div class="dialog-top"><h2>Mon CV original</h2>${btn("Fermer", "close")}</div><p class="spacer">Présentation fictive du PDF · aucune extraction de tes données.</p><div class="paper-full"><h2>Alex Martin</h2><p>${cv.title}<br>alex.martin@example.com · Paris</p><hr><h3>Présentation</h3><p>${cv.summary}</p><h3>Compétences</h3><p>${cv.skills.join("\n")}</p><h3>Projets</h3><p>${cv.projects.join("\n")}</p><h3>Formation</h3><p>${cv.education}</p></div><div class="actions">${btn("Télécharger le PDF fictif", "download-cv")}</div>`,
    true,
  );
}
function previewLetter(app) {
  openDialog(
    `<div class="dialog-top"><h2>Aperçu de ma lettre</h2>${btn("Fermer", "close")}</div><p class="spacer">Aperçu de lecture du texte actuel · le rendu PDF sera relié dans le lot Préparation.</p><div class="paper-full"><strong>Alex Martin</strong><p>alex.martin@example.com · Paris</p><hr><h3>Candidature — ${esc(app.title)}</h3><p>${esc(latestDraft(app.id) || "Aucune lettre rédigée.")}</p></div>`,
    true,
  );
}
function simulationDownload(file) {
  const link = document.createElement("a");
  link.href = new URL(`samples/${file}`, import.meta.url).href;
  link.download = file;
  document.body.append(link);
  link.click();
  link.remove();
  toast(
    "Exemple fictif téléchargé. Il ne reproduit pas les modifications de cette session.",
  );
}
document.addEventListener("click", async (event) => {
  const bucket = event.target.closest("[data-bucket]");
  if (bucket) {
    offerBucket = bucket.dataset.bucket;
    render();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const [action, value] = target.dataset.action.split(":");
  const route = currentRoute(),
    app = applications.find((item) => item.id === route.id);
  if (action === "close") closeDialog();
  if (action === "open-offers") go("offers");
  if (action === "examine") {
    selectedOffer = value;
    offerBucket = "pending";
    search = "";
    category = "all";
    go("offers");
  }
  if (action === "select") {
    selectedOffer = value;
    render();
    if (innerWidth <= 650)
      document
        .querySelector(".detail-panel")
        ?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
  }
  if (action === "prepare") prepare(value);
  if (action === "later") {
    decisions[value] = "later";
    render();
    toast("Offre conservée dans « Plus tard ».");
  }
  if (action === "reject")
    openDialog(
      `<h2>Écarter cette offre</h2><p>L’offre reste dans l’historique du prototype.</p><form id="reject-form" data-id="${value}"><label>Motif<textarea class="field" name="reason" required maxlength="500" rows="3"></textarea></label><div class="actions">${btn("Annuler", "close")}<button class="button primary" type="submit">Confirmer</button></div></form>`,
    );
  if (action === "tab" && app) go(`dossier/${app.id}/${value}`);
  if (action === "preview-cv") previewCv();
  if (action === "preview-letter" && app) previewLetter(app);
  if (action === "download-cv") simulationDownload("CV_Alex_Martin.pdf");
  if (action === "download-letter-pdf")
    simulationDownload("Lettre_Atelier_Numerique.pdf");
  if (action === "download-letter-docx")
    simulationDownload("Lettre_Atelier_Numerique.docx");
  if (action === "external")
    toast(
      "Annonce fictive sur example.com. Aucun site employeur n’est ouvert.",
    );
  if (action === "change-cv")
    openDialog(
      `<h2>Choisir mon CV</h2><p>Le prototype utilise uniquement un fichier synthétique.</p><div class="file-row"><span class="file-icon">PDF</span><div><strong>${cv.name}</strong><small>Original importé · ${cv.size}</small></div><span class="badge green">Sélectionné</span></div><div class="actions">${btn("Utiliser ce CV", "close", true)}</div>`,
    );
  if (action === "save-letter" && app) {
    app.letter = latestDraft(app.id);
    app.letterSaved = true;
    drafts.delete(app.id);
    render();
    toast(
      "Brouillon conservé dans cette session du prototype. Un rechargement le réinitialise.",
    );
  }
  if (action === "copy-letter" && app) {
    try {
      await navigator.clipboard.writeText(latestDraft(app.id));
      toast("Texte de la lettre copié.");
    } catch {
      toast("Copie indisponible : sélectionne le texte dans l’éditeur.");
    }
  }
  if (action === "generate" && app) {
    if (scenario === "error") {
      toast(
        "Refus IA simulé (403). Le brouillon est conservé ; voir Activité IA.",
      );
      return;
    }
    openDialog(
      `<h2>Proposition à vérifier</h2><p>Simulation locale : aucun appel IA, aucun coût. Ton texte actuel reste conservé jusqu’à ton choix.</p><div class="ai-proposal">${esc(defaultLetter.replace("développeur backend Python", app.title.toLowerCase()))}</div><div class="actions">${btn("Garder mon texte", "close")}${btn("Utiliser cette proposition", "apply-letter", true)}</div>`,
    );
  }
  if (action === "apply-letter" && app) {
    drafts.set(
      app.id,
      defaultLetter.replace(
        "développeur backend Python",
        app.title.toLowerCase(),
      ),
    );
    closeDialog();
    render();
    toast("Proposition appliquée au brouillon, à corriger et conserver.");
  }
  if (action === "confirm-send" && app)
    openDialog(
      `<h2>Confirmer mon envoi</h2><p>Déclaration fictive. Aucun formulaire externe ni e-mail ne sera envoyé.</p><form id="send-form"><label>Date d’envoi<input class="field" type="date" name="date" value="2026-10-13" max="2026-10-13" required></label><label>Canal<select class="field" name="channel"><option>Formulaire employeur</option><option>E-mail</option><option>Autre</option></select></label><label><input type="checkbox" checked disabled> ${cv.name}</label><label><input type="checkbox" name="letter" ${latestDraft(app.id) ? "" : "disabled"}> Lettre de motivation ${drafts.has(app.id) ? "(brouillon actuel)" : ""}</label><div class="actions">${btn("Annuler", "close")}<button class="button primary" type="submit">Confirmer l’envoi fictif</button></div></form>`,
    );
  if (action === "add-response" && app)
    openDialog(
      `<h2>Noter une réponse</h2><form id="response-form"><label>Réponse<select class="field" name="kind"><option>Réponse du recruteur</option><option>Refus reçu</option><option>Proposition reçue</option></select></label><label>Note<textarea class="field" name="note" maxlength="1000" rows="3" required></textarea></label><div class="actions">${btn("Annuler", "close")}<button class="button primary" type="submit">Conserver dans le prototype</button></div></form>`,
    );
  if (action === "plan-interview" && app)
    openDialog(
      `<h2>Planifier un entretien</h2><form id="interview-form"><label>Date prévue<input class="field" type="date" name="date" min="2026-10-13" value="2026-10-15" required></label><label>Lieu ou canal<input class="field" name="place" placeholder="Visioconférence, sur place…" required maxlength="200"></label><div class="actions">${btn("Annuler", "close")}<button class="button primary" type="submit">Conserver la date prévue</button></div></form>`,
    );
  if (action === "reminder" && app)
    openDialog(
      `<h2>Préparer ma relance</h2><p>Tu peux noter une action sans l’envoyer.</p><form id="reminder-form"><label>Date de relance<input class="field" type="date" name="date" value="2026-10-13" required></label><label>Note<textarea class="field" name="note" required rows="3" maxlength="1000">Demander un retour sur ma candidature.</textarea></label><div class="actions">${btn("Annuler", "close")}<button class="button primary" type="submit">Conserver l’action</button></div></form>`,
    );
  if (action === "add-offer")
    openDialog(
      `<h2>Ajouter une offre</h2><p>Dans la version intégrée : lien ou texte, puis champs à vérifier. Ici, une offre synthétique permet de parcourir la préparation.</p><div class="actions">${btn("Annuler", "close")}${btn("Utiliser l’offre de démonstration", "demo-offer", true)}</div>`,
    );
  if (action === "demo-offer") {
    scenario = "normal";
    document.querySelector("#scenario").value = scenario;
    closeDialog();
    prepare("atelier");
  }
  if (action === "recover") {
    scenario = "normal";
    document.querySelector("#scenario").value = scenario;
    render();
    toast("Synchronisation simulée. Aucun brouillon abandonné.");
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (
    ![
      "send-form",
      "reject-form",
      "response-form",
      "interview-form",
      "reminder-form",
    ].includes(form.id)
  )
    return;
  event.preventDefault();
  const values = new FormData(form),
    app = applications.find((item) => item.id === currentRoute().id);
  if (form.id === "reject-form") {
    decisions[form.dataset.id] = "rejected";
    closeDialog();
    render();
    toast("Offre écartée dans le prototype.");
    return;
  }
  if (!app) return;
  if (form.id === "send-form") {
    app.sent = true;
    app.submittedLetter = values.has("letter");
    app.status = "waiting";
    app.next = "Attendre une réponse";
    app.history.unshift({
      title: "Candidature envoyée",
      detail: `${values.get("date")} · ${values.get("channel")} · CV original${values.has("letter") ? " et lettre" : ""}`,
    });
    app.date = "13 oct.";
    closeDialog();
    go(`dossier/${app.id}/follow`);
    toast(
      "Envoi fictif confirmé. Les téléchargements seuls ne créent aucun envoi.",
    );
    return;
  }
  if (form.id === "response-form") {
    app.history.unshift({
      title: values.get("kind"),
      detail: `13 octobre · ${values.get("note")}`,
    });
    app.status =
      values.get("kind") === "Refus reçu"
        ? "refused"
        : values.get("kind") === "Proposition reçue"
          ? "offer"
          : "responded";
    app.next = "Lire la réponse et décider de la suite";
  }
  if (form.id === "interview-form") {
    app.status = "interview";
    app.next = `Entretien prévu le ${values.get("date")}`;
    app.history.unshift({
      title: "Entretien planifié",
      detail: `${values.get("date")} · ${values.get("place")} · réalisation non confirmée`,
    });
  }
  if (form.id === "reminder-form") {
    app.next = `Relancer le ${values.get("date")}`;
    app.history.unshift({
      title: "Relance à préparer",
      detail: `${values.get("date")} · ${values.get("note")} · aucun message envoyé`,
    });
  }
  closeDialog();
  render();
  toast("Élément fictif conservé dans cette session.");
});
document.addEventListener("input", (event) => {
  if (event.target.id === "letter") {
    const app = applications.find((item) => item.id === currentRoute().id);
    if (!app) return;
    drafts.set(app.id, event.target.value);
    document.querySelector("#save-label").textContent =
      "Brouillon non enregistré · conservé pendant la navigation";
    document
      .querySelectorAll(
        '[data-action="copy-letter"],[data-action="download-letter-pdf"],[data-action="download-letter-docx"]',
      )
      .forEach((button) => {
        button.disabled = !event.target.value.trim();
      });
    const mini = document.querySelector("#mini-preview");
    if (mini) mini.innerHTML = documentPreview(true, app);
  }
  if (event.target.id === "search") {
    const cursor = event.target.selectionStart;
    search = event.target.value;
    render();
    const input = document.querySelector("#search");
    input.focus();
    input.setSelectionRange(cursor, cursor);
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "category") {
    category = event.target.value;
    render();
  }
  if (event.target.id === "sort") {
    sort = event.target.value;
    render();
  }
  if (event.target.id === "scenario") {
    scenario = event.target.value;
    render();
  }
});
document.addEventListener("keydown", (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
    return;
  event.preventDefault();
  const values = ["prepare", "follow", "offer"],
    current = currentRoute(),
    index = values.indexOf(current.tab);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? 2
        : (index + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3;
  location.hash = `dossier/${current.id}/${values[next]}`;
  setTimeout(() => document.querySelector(`#tab-${values[next]}`)?.focus(), 0);
});
function setMenu(open) {
  const sidebar = document.querySelector("#sidebar");
  sidebar.classList.toggle("open", open);
  document.querySelector("#menu-shade").hidden = !open;
  document
    .querySelector("#open-menu")
    .setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) document.querySelector("#close-menu").focus();
}
document
  .querySelector("#open-menu")
  .addEventListener("click", () => setMenu(true));
for (const id of ["close-menu", "menu-shade"])
  document.querySelector(`#${id}`).addEventListener("click", () => {
    setMenu(false);
    document.querySelector("#open-menu").focus();
  });
document.addEventListener("keydown", (event) => {
  if (!document.querySelector("#sidebar").classList.contains("open")) return;
  if (event.key === "Escape") {
    setMenu(false);
    document.querySelector("#open-menu").focus();
  }
  if (event.key === "Tab") {
    const nodes = [
        ...document.querySelector("#sidebar").querySelectorAll("a,button"),
      ],
      first = nodes[0],
      last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
matchMedia("(min-width:921px)").addEventListener("change", () =>
  setMenu(false),
);
document.querySelector("#theme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector("#theme-label").textContent = dark
    ? "Thème clair"
    : "Thème sombre";
});
document.querySelector("#reset").addEventListener("click", () => {
  if (dialog.open) closeDialog();
  applications = structuredClone(initialApplications);
  decisions = {};
  drafts.clear();
  scenario = "normal";
  search = "";
  category = "all";
  offerBucket = "pending";
  document.querySelector("#scenario").value = "normal";
  setMenu(false);
  go("dashboard");
  toast("Données fictives réinitialisées.");
});
window.addEventListener("hashchange", () => {
  const tabFocused = document.activeElement?.matches('[role="tab"]');
  setMenu(false);
  render();
  if (tabFocused)
    document.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  else main.focus();
  window.scrollTo(0, 0);
});
document.querySelectorAll("[data-icon]").forEach((node) => {
  node.innerHTML = icon(node.dataset.icon);
});
render();

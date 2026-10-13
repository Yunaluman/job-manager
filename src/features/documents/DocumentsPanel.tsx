import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "../../shared/ui/Button";
import { Field } from "../../shared/ui/Field";
import { useData } from "../../data";
import { hasApiKey, callApi, providerId } from "../../cv";
import type { Application } from "../../../shared/contracts/types";
import type {
  DocumentVersion,
  DocumentInput,
  LetterField,
  LetterContent,
  CvContent,
} from "../../../shared/contracts/document-types";
import { cvText } from "../../../shared/domain/cv-document.mjs";
import {
  DOCUMENT_STATUS,
  saveDocument,
  downloadDocument,
  downloadDraft,
} from "../../documents";
import { downloadOriginal } from "../../originals";
import { OriginalPreview } from "./OriginalLibrary";
import { WriteForm } from "../../components/WriteForm";
import { DocumentPreview } from "./DocumentPreview";
const fields: Record<LetterField, string> = {
  sender: "Expéditeur",
  recipient: "Destinataire",
  placeDate: "Lieu et date",
  subject: "Objet",
  greeting: "Formule d’appel",
  body: "Contenu",
  closing: "Formule de clôture",
  signature: "Signature",
};
export function DocumentsPanel({ application }: { application: Application }) {
  const { journey, settings, analyses, cvOriginals } = useData();
  const [edit, setEdit] = useState<{ id: string; input: DocumentInput }>(),
    [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<DocumentVersion>(),
    [draftPreview, setDraftPreview] = useState<DocumentInput>();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [generating, setGenerating] = useState(false),
    generatingRef = useRef(false);
  const [proposal, setProposal] = useState<{
    body: string;
    model: string;
    provider: "mistral" | "zai";
  }>();
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState<string>(),
    [showOriginal, setShowOriginal] = useState(false);
  const documents = journey.documents.filter(
    (doc) => doc.applicationId === application.id && doc.kind === "letter",
  );
  const versions = journey.documentVersions
    .filter((version) => documents.some((doc) => doc.id === version.documentId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cvVersions = journey.documentVersions.filter(
    (version) =>
      version.templateVersion === "single-column-cv-v1" &&
      journey.documents.some(
        (doc) =>
          doc.id === version.documentId &&
          (!doc.applicationId || doc.applicationId === application.id),
      ),
  );
  const sourceKey = (sources: DocumentVersion["sources"]) =>
    sources.cvVersionId
      ? `version:${sources.cvVersionId}`
      : sources.originalId
        ? `original:${sources.originalId}`
        : "profile";
  const defaultOriginal = cvOriginals
    .filter((item) => item.format === "pdf")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const defaultKey = versions[0]
    ? sourceKey(versions[0].sources)
    : defaultOriginal
      ? `original:${defaultOriginal.id}`
      : "profile";
  const selectedKey = edit
    ? sourceKey(edit.input.sources)
    : (choice ?? defaultKey);
  const original = selectedKey.startsWith("original:")
    ? cvOriginals.find((item) => item.id === selectedKey.slice(9))
    : undefined;
  function sources(key: string): DocumentVersion["sources"] {
    const original = cvOriginals.find((item) => key === `original:${item.id}`),
      version = cvVersions.find((item) => key === `version:${item.id}`);
    return {
      offerText:
        journey.offers.find((item) => item.applicationId === application.id)
          ?.text ??
        application.jobText ??
        "",
      cvText:
        original?.text ??
        (version
          ? cvText(version.content as CvContent, version.layout)
          : settings.cvText),
      ...(original
        ? { originalId: original.id }
        : version
          ? { cvVersionId: version.id }
          : {}),
      generationMode: "manual",
    };
  }
  function patch(input: Partial<DocumentInput>) {
    setEdit((old) => old && { ...old, input: { ...old.input, ...input } });
    setDirty(true);
    setDraftPreview(undefined);
    setMessage("");
  }
  function start(version?: DocumentVersion, legacyText?: string) {
    if (
      generatingRef.current ||
      (dirty && !confirm("Abandonner les modifications non enregistrées ?"))
    )
      return;
    const content = (version?.content as LetterContent | undefined) ?? {
      sender: [
        settings.profileName,
        settings.profileEmail,
        settings.profilePhone,
        settings.profileCity,
      ]
        .filter(Boolean)
        .join("\n"),
      recipient: application.company,
      placeDate: [
        settings.profileCity,
        new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }),
      ]
        .filter(Boolean)
        .join(", "),
      subject: `Candidature — ${application.title}`,
      greeting: "",
      body: legacyText ?? "",
      closing: "",
      signature: settings.profileName,
    };
    setEdit({
      id: version?.documentId ?? crypto.randomUUID(),
      input: {
        kind: "letter",
        applicationId: application.id,
        title: version?.title ?? `Lettre — ${application.company}`,
        status: "draft",
        content,
        layout: version?.layout ?? {
          fontSize: 11,
          marginMm: 20,
          hidden: legacyText
            ? [
                "sender",
                "recipient",
                "placeDate",
                "subject",
                "greeting",
                "closing",
                "signature",
              ]
            : [],
        },
        ...(version ? { parentVersionId: version.id } : {}),
        sources: version?.sources ?? {
          ...sources(selectedKey),
          ...(legacyText ? { legacyText } : {}),
        },
      },
    });
    setDirty(false);
    setProposal(undefined);
    setPreview(undefined);
    setDraftPreview(undefined);
    setError("");
    setMessage("");
  }
  async function generate() {
    if (!edit || generatingRef.current || proposal) return;
    generatingRef.current = true;
    setGenerating(true);
    setError("");
    const model = settings.model,
      provider = providerId(settings) as "mistral" | "zai",
      input = edit.input;
    try {
      const body = await callApi(
        `Propose uniquement le corps d’une lettre de motivation en français. Aucun en-tête, coordonnées, objet, formule d’appel, clôture ou signature. N’invente aucune expérience. CV source :\n${input.sources.cvText ?? ""}\nOffre source :\n${input.sources.offerText ?? ""}`,
        settings,
        "letter-generation",
      );
      setProposal({ body, model, provider });
      setDirty(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Génération impossible.",
      );
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }
  async function copy(content: LetterContent, hidden: string[]) {
    try {
      await navigator.clipboard.writeText(
        (Object.keys(fields) as LetterField[])
          .filter((key) => !hidden.includes(key))
          .map((key) => content[key])
          .filter(Boolean)
          .join("\n\n"),
      );
      setMessage("Texte copié.");
    } catch {
      setError("Copie impossible. Sélectionne le texte manuellement.");
    }
  }
  const field = (key: LetterField) => (
    <div key={key}>
      <label className="block text-sm font-medium">
        {fields[key]}
        <textarea
          className="app-field mt-1"
          rows={key === "body" ? 10 : 2}
          required={key === "body"}
          value={(edit!.input.content as LetterContent)[key]}
          onChange={(event) =>
            patch({
              content: {
                ...(edit!.input.content as LetterContent),
                [key]: event.target.value,
              },
            })
          }
        />
      </label>
      {key !== "body" && (
        <label className="text-sm">
          <input
            type="checkbox"
            checked={!edit!.input.layout.hidden.includes(key)}
            onChange={(event) =>
              patch({
                layout: {
                  ...edit!.input.layout,
                  hidden: event.target.checked
                    ? edit!.input.layout.hidden.filter((item) => item !== key)
                    : [...edit!.input.layout.hidden, key],
                },
              })
            }
          />{" "}
          Afficher {fields[key].toLowerCase()}
        </label>
      )}
    </div>
  );
  return (
    <fieldset disabled={saving} className="min-w-0">
      <section className="app-panel mb-5 p-5" aria-label="CV de candidature">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">CV à utiliser</h2>
          <Link to="/profil" className="text-sm underline">
            Importer un original
          </Link>
        </div>
        <label className="mt-4 block text-sm">
          Source du CV
          <select
            className="app-field mt-1"
            value={selectedKey}
            disabled={generating || !!proposal}
            onChange={(event) => {
              setChoice(event.target.value);
              setShowOriginal(false);
              if (edit) patch({ sources: sources(event.target.value) });
            }}
          >
            <optgroup label="Originaux importés">
              {cvOriginals.map((item) => (
                <option key={item.id} value={`original:${item.id}`}>
                  {item.name} · {item.format.toUpperCase()}
                </option>
              ))}
            </optgroup>
            <optgroup label="Versions structurées — adaptation facultative">
              {cvVersions.map((item) => (
                <option key={item.id} value={`version:${item.id}`}>
                  {item.title} · v{item.number}
                </option>
              ))}
            </optgroup>
            <option value="profile">
              Ancien texte du profil — sans fichier original
            </option>
          </select>
        </label>
        <p className="mt-2 text-xs text-muted">
          La source est conservée avec la version de la lettre. Changer de CV
          ne réécrit pas ta lettre.
        </p>
        {original ? (
          <>
            <p className="mt-3 text-sm">
              Original importé · {Math.ceil(original.size / 1024)} Kio ·{" "}
              {new Date(original.createdAt).toLocaleDateString("fr-FR")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className="app-button"
                onClick={() => setShowOriginal(!showOriginal)}
              >
                {showOriginal
                  ? "Masquer l’original"
                  : "Aperçu du CV original"}
              </Button>
              <Button
                className="app-primary"
                onClick={() =>
                  void downloadOriginal(original).catch((reason) =>
                    setError(reason.message),
                  )
                }
              >
                Télécharger le CV original
              </Button>
            </div>
            {showOriginal && (
              <OriginalPreview key={original.id} value={original} />
            )}
          </>
        ) : selectedKey === "profile" ? (
          <p className="mt-3 text-sm text-amber-700">
            Aucun fichier sélectionné. Le texte du profil sert à la
            génération, mais ne constitue pas un CV à joindre.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Version structurée sélectionnée. Son export est disponible
            dans « Adapter mon CV ».
          </p>
        )}
      </section>
      <section className="app-panel mb-5 p-5" id="documents">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Lettre de motivation</h2>
          <Button
            className="app-button"
            disabled={generating}
            onClick={() => start()}
          >
            Nouvelle lettre
          </Button>
        </div>
        {!edit && !versions.length && (
          <p className="mt-4 text-sm text-muted">
            Rédige une lettre ou demande une proposition IA. La lettre reste
            facultative.
          </p>
        )}
        {error && (
          <p role="alert" className="my-3 text-rose-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="my-3 text-emerald-700">
            {message}
          </p>
        )}
        {edit && (
          <div className="mt-5">
            <WriteForm
              dirty={dirty}
              disabled={generating || !!proposal}
              label="Enregistrer une nouvelle version"
              save={async () => {
                await saveDocument(edit.id, edit.input);
                setChoice(sourceKey(edit.input.sources));
                setDirty(false);
                setEdit(undefined);
                setDraftPreview(undefined);
                setMessage("Nouvelle version enregistrée.");
              }}
            >
              {field("body")}
              <div className="flex flex-wrap gap-2">
                <Button
                  className="app-button"
                  disabled={!(edit.input.content as LetterContent).body.trim()}
                  onClick={() =>
                    void copy(
                      edit.input.content as LetterContent,
                      edit.input.layout.hidden,
                    )
                  }
                >
                  Copier le texte
                </Button>
                <Button
                  className="app-button"
                  disabled={!(edit.input.content as LetterContent).body.trim()}
                  onClick={() => setDraftPreview(edit.input)}
                >
                  Aperçu PDF
                </Button>
                {(["pdf", "docx"] as const).map((format) => (
                  <Button
                    className="app-button"
                    key={format}
                    disabled={
                      !(edit.input.content as LetterContent).body.trim()
                    }
                    onClick={() =>
                      void downloadDraft(edit.input, format).catch((reason) =>
                        setError(reason.message),
                      )
                    }
                  >
                    Télécharger {format.toUpperCase()}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted">
                Les exports du brouillon ne l’enregistrent pas et ne
                déclarent aucun envoi.
              </p>
              <details>
                <summary className="cursor-pointer font-medium">
                  Coordonnées et mise en page
                </summary>
                <div className="mt-4 space-y-4">
                  <label className="block">
                    Titre
                    <input
                      className="app-field"
                      required
                      maxLength={300}
                      value={edit.input.title}
                      onChange={(event) => patch({ title: event.target.value })}
                    />
                  </label>
                  {(Object.keys(fields) as LetterField[])
                    .filter((key) => key !== "body")
                    .map(field)}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      Taille (10–12 pt)
                      <Field
                        type="number"
                        min={10}
                        max={12}
                        value={edit.input.layout.fontSize}
                        onChange={(event) =>
                          patch({
                            layout: {
                              ...edit.input.layout,
                              fontSize: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Marges (15–25 mm)
                      <Field
                        type="number"
                        min={15}
                        max={25}
                        value={edit.input.layout.marginMm}
                        onChange={(event) =>
                          patch({
                            layout: {
                              ...edit.input.layout,
                              marginMm: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted">
                    Calibri dans Word, Carlito dans le PDF.
                  </p>
                </div>
              </details>
              <label className="block text-sm">
                État de la lettre
                <select
                  className="app-field mt-1"
                  value={edit.input.status}
                  onChange={(event) =>
                    patch({
                      status: event.target.value as DocumentInput["status"],
                    })
                  }
                >
                  <option value="draft">Brouillon</option>
                  <option value="ready">Prêt — je valide ce contenu</option>
                  <option value="archived">Archivé</option>
                </select>
              </label>
              {hasApiKey(settings) && (
                <div className="rounded-xl border border-line p-4">
                  <p className="mb-2 text-xs text-muted">
                    {providerId(settings) === "mistral" ? "Mistral" : "Z.ai"} ·{" "}
                    {settings.model}. Envoie le texte du CV sélectionné et
                    de l’annonce au fournisseur.
                  </p>
                  <Button
                    className="app-button"
                    disabled={
                      generating ||
                      !edit.input.sources.cvText ||
                      !edit.input.sources.offerText
                    }
                    onClick={() => void generate()}
                  >
                    {generating
                      ? "Génération…"
                      : "Proposer une lettre avec l’IA"}
                  </Button>
                </div>
              )}
            </WriteForm>
            {proposal && (
              <section
                className="my-4 rounded-xl border border-line p-4"
                aria-label="Proposition IA à vérifier"
              >
                <h3 className="font-semibold">
                  Proposition à vérifier · {proposal.model}
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-semibold">
                      Ta lettre actuelle
                    </h4>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {(edit.input.content as LetterContent).body || "Vide"}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Proposition IA</h4>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {proposal.body}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    className="app-primary"
                    onClick={() => {
                      patch({
                        content: {
                          ...(edit.input.content as LetterContent),
                          body: proposal.body,
                        },
                        sources: {
                          ...edit.input.sources,
                          generationMode: "api",
                          generationModel: proposal.model,
                          generationProvider: proposal.provider,
                        },
                      });
                      setProposal(undefined);
                    }}
                  >
                    Utiliser cette proposition
                  </Button>
                  <Button
                    className="app-button"
                    onClick={() => setProposal(undefined)}
                  >
                    Garder ma lettre
                  </Button>
                </div>
              </section>
            )}
            <Button
              className="app-button mt-3"
              disabled={generating}
              onClick={() => {
                if (!dirty || confirm("Abandonner ce brouillon ?")) {
                  setEdit(undefined);
                  setDirty(false);
                  setProposal(undefined);
                  setDraftPreview(undefined);
                }
              }}
            >
              Annuler l’édition
            </Button>
            {draftPreview && (
              <DocumentPreview
                draft={draftPreview}
                close={() => setDraftPreview(undefined)}
              />
            )}
          </div>
        )}
        {preview && (
          <DocumentPreview
            version={preview}
            close={() => setPreview(undefined)}
          />
        )}
        {!!versions.length && (
          <details className="mt-5" open={!edit}>
            <summary className="cursor-pointer font-medium">
              Versions conservées ({versions.length})
            </summary>
            {versions.map((version) => (
              <div className="mt-4 border-t border-line pt-4" key={version.id}>
                <p className="font-medium">
                  {version.title} · v{version.number} ·{" "}
                  {DOCUMENT_STATUS[version.status]}
                </p>
                <p className="text-xs text-muted">
                  {new Date(version.createdAt).toLocaleString("fr-FR")} ·{" "}
                  {version.sources.originalId
                    ? cvOriginals.find(
                        (item) => item.id === version.sources.originalId,
                      )?.name
                    : "Source texte ou structurée"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    className="app-button"
                    disabled={generating}
                    onClick={() => start(version)}
                  >
                    Modifier
                  </Button>
                  <Button
                    className="app-button"
                    onClick={() =>
                      void copy(
                        version.content as LetterContent,
                        version.layout.hidden,
                      )
                    }
                  >
                    Copier le texte
                  </Button>
                  <Button
                    className="app-button"
                    onClick={() => setPreview(version)}
                  >
                    Aperçu PDF
                  </Button>
                  {(["pdf", "docx"] as const).map((format) => (
                    <Button
                      className="app-button"
                      key={format}
                      onClick={() =>
                        void downloadDocument(version, format).catch((reason) =>
                          setError(reason.message),
                        )
                      }
                    >
                      Télécharger {format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </details>
        )}
        <details className="mt-5">
          <summary>Anciennes lettres — conversion manuelle</summary>
          {analyses
            .filter(
              (analysis) =>
                analysis.applicationId === application.id &&
                analysis.kind === "lettre",
            )
            .map((analysis) => (
              <div key={analysis.id}>
                <p className="my-2 whitespace-pre-wrap break-words text-sm">
                  {analysis.result}
                </p>
                <Button
                  className="app-button"
                  disabled={generating}
                  onClick={() => start(undefined, analysis.result)}
                >
                  Préparer une copie structurée
                </Button>
              </div>
            ))}
        </details>
      </section>
    </fieldset>
  );
}

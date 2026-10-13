import { resolvePreparationCv } from "../../../shared/domain/preparation-source.mjs";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useData, dataStore } from "../../data";
import { Button } from "../../shared/ui/Button";
import { WriteForm } from "../../components/WriteForm";
import type { Application } from "../../../shared/contracts/types";
import { isCsvReadOnly } from "../../../shared/contracts/types";
import type { Submission } from "../../../shared/contracts/submission-types";
import { parisDay } from "../../../shared/domain/actions-core.mjs";
export function SubmissionPanel({ applicationId }: { applicationId: string }) {
  const { journey, applications, cvOriginals } = useData(),
    app = applications.find((item) => item.id === applicationId)!;
  const [saving,setSaving]=useState(false)
  const [opened, setOpened] = useState(false),
    [date, setDate] = useState(""),
    [channel, setChannel] =
      useState<NonNullable<Submission["channel"]>>("unknown"),
    [cv, setCv] = useState(""),
    [letter, setLetter] = useState("none"),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const versions = (kind: string) =>
    journey.documentVersions
      .filter((version) =>
        journey.documents.some(
          (doc) =>
            doc.id === version.documentId &&
            (doc.applicationId === applicationId || (kind === "cv" && !doc.applicationId)) &&
            doc.kind === kind,
        ),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const label = (id?: string) => {
    const version = journey.documentVersions.find((item) => item.id === id);
    return version ? `${version.title} · v${version.number}` : "Inconnu";
  };
  const channels = {
    form: "Formulaire employeur",
    email: "Email",
    other: "Autre canal",
    unknown: "Canal inconnu",
  };
  function open() {
    const selected = resolvePreparationCv(app, journey, cvOriginals);
    setCv(selected.kind === "profile" ? "" : `${selected.kind}:${selected.id}`);
    setOpened(true);
    setError("");
  }
  return (
    <fieldset disabled={saving} className="min-w-0"><section className="app-panel my-5 p-5" id="declared-send">
      <h2 className="text-lg font-semibold">Envoi et documents utilisés</h2>
      <p className="my-3 text-sm text-muted">
        Confirme un envoi effectué sur le site employeur ou par email.
      </p>
      {isCsvReadOnly(app) ? (
        <p className="text-sm">
          Cette copie CSV reste en lecture seule.{" "}
          <Link className="underline" to="/parametres">
            Vérifier la reprise dans JobPilot
          </Link>
        </p>
      ) : (
        <Button className="app-primary" onClick={open} disabled={opened}>
          J’ai envoyé ma candidature
        </Button>
      )}
      {opened && (
        <div className="mt-4" role="region" aria-label="Confirmer l’envoi">
          <WriteForm
            dirty={true}
            label="Confirmer l’envoi réalisé"
            save={async () => {
              setSaving(true);try { await dataStore.mutate<{
                submission: Submission;
                application: Application;
              }>(() => ({
                method: "POST",
                path: "submissions/confirm",
                body: {
                  id: crypto.randomUUID(),
                  applicationId,
                  occurredAt: date,
                  channel,
                  note,
                  ...(cv
                    ? cv.startsWith("original:")
                      ? { cvOriginalId: cv.slice(9) }
                      : { cvVersionId: cv.slice(8) }
                    : {}),
                  ...(letter === "none"
                    ? { letterOmitted: true }
                    : letter === "unknown"
                      ? {}
                      : { letterVersionId: letter }),
                },
                apply: (state, result) => ({
                  ...state,
                  applications: state.applications.map((item) =>
                    item.id === result.application.id
                      ? result.application
                      : item,
                  ),
                  journey: {
                    ...state.journey,
                    submissions: [
                      ...state.journey.submissions,
                      result.submission,
                    ],
                  },
                }),
              }));
              setDate("");
              setNote("");
              setOpened(false); } finally {setSaving(false)}
            }}
          >
            <label className="block text-sm">
              Date réelle d’envoi
              <input
                className="app-field mt-1"
                type="date"
                required
                max={parisDay()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Canal d’envoi
              <select
                className="app-field mt-1"
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as typeof channel)
                }
              >
                {Object.entries(channels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              CV effectivement envoyé
              <select
                className="app-field mt-1"
                value={cv}
                onChange={(event) => setCv(event.target.value)}
              >
                <option value="">CV inconnu — envoi historique</option>
                <optgroup label="Originaux importés">
                  {cvOriginals.map((item) => (
                    <option key={item.id} value={`original:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Versions structurées du dossier">
                  {versions("cv").map((item) => (
                    <option key={item.id} value={`version:${item.id}`}>
                      {item.title} · v{item.number}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="block text-sm">
              Lettre effectivement envoyée
              <select
                className="app-field mt-1"
                value={letter}
                onChange={(event) => setLetter(event.target.value)}
              >
                <option value="none">Sans lettre — CV seul</option>
                <option value="unknown">Lettre inconnue</option>
                {versions("letter").map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · v{item.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Note
              <textarea
                className="app-field mt-1"
                maxLength={10000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <p className="text-xs text-muted">
              Le téléchargement n’est pas un envoi. Confirme uniquement les
              documents réellement utilisés ; leur référence sera conservée.
            </p>
          </WriteForm>
          <Button
            className="app-button mt-3"
            onClick={() => {
              if (confirm("Abandonner cette déclaration non enregistrée ?"))
                setOpened(false);
            }}
          >
            Annuler la déclaration
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <ol className="mt-4 space-y-3">
        {journey.submissions
          .filter((item) => item.applicationId === applicationId)
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .map((item) => (
            <li className="border-t border-line pt-3 text-sm" key={item.id}>
              <p className="font-semibold">
                Envoi du{" "}
                {new Date(`${item.occurredAt}T12:00:00Z`).toLocaleDateString(
                  "fr-FR",
                )}
                {item.cancelledAt ? " · ANNULÉ" : ""}
              </p>
              <p>
                {channels[item.channel ?? "unknown"]} · CV :{" "}
                {item.cvOriginalId
                  ? cvOriginals.find(
                      (original) => original.id === item.cvOriginalId,
                    )?.name
                  : label(item.cvVersionId)}{" "}
                · Lettre :{" "}
                {item.letterOmitted
                  ? "Non utilisée"
                  : label(item.letterVersionId)}
              </p>
              {!item.cvOriginalId && !item.cvVersionId && (
                <p className="text-amber-700">CV utilisé inconnu.</p>
              )}
              <p className="whitespace-pre-wrap">{item.note}</p>
              {!item.cancelledAt && (
                <Button
                  className="app-button mt-2"
                  onClick={() => {
                    if (
                      confirm(
                        "Annuler cette déclaration erronée ? Son historique reste conservé. Le statut ne sera pas réécrit.",
                      )
                    )
                      void dataStore
                        .mutate<Submission>(() => ({
                          method: "POST",
                          path: `submissions/${encodeURIComponent(item.id)}/cancel`,
                          body: {},
                          apply: (state, result) => ({
                            ...state,
                            journey: {
                              ...state.journey,
                              submissions: state.journey.submissions.map(
                                (old) => (old.id === result.id ? result : old),
                              ),
                            },
                          }),
                        }))
                        .catch((reason) => setError(reason.message));
                  }}
                >
                  Annuler cette déclaration erronée
                </Button>
              )}
            </li>
          ))}
      </ol>
    </section></fieldset>
  );
}

import { useState } from "react";
import { useData, dataStore } from "../../data";
import {
  isCsvReadOnly,
  type Application,
} from "../../../shared/contracts/types";
import { Button } from "../../shared/ui/Button";
import { WriteForm } from "../../components/WriteForm";
export function NativeAdoption() {
  const { applications } = useData(),
    [ids, setIds] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [exportError, setExportError] = useState("");
  const copies = applications.filter(isCsvReadOnly);
  async function download() {
    try {
      const token =
        document.querySelector<HTMLMetaElement>('meta[name="jobpilot-session"]')
          ?.content ?? "";
      const res = await fetch("/api/register/export", {
        headers: { "X-JobPilot-Session": token },
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw Error("Export CSV impossible.");
      const url = URL.createObjectURL(await res.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = "candidatures.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Export impossible.",
      );
    }
  }
  return (
    <section className="app-panel p-5">
      <h2 className="text-lg font-semibold">Suivi principal dans JobPilot</h2>
      <p className="my-3 text-sm text-muted">
        Après rapprochement du CSV, vérifie les copies ci-dessous. L’adoption
        les rend modifiables et conserve leur provenance. Les anciens chemins de
        documents restent des références.
      </p>
      {!!copies.length && (
        <WriteForm
          dirty={ids.length > 0}
          label="Adopter les dossiers vérifiés"
          canSubmit={ids.length > 0 && confirmed}
          save={async () => {
            await dataStore.mutate<{
              applications: Application[];
              backupVerified: boolean;
            }>(() => ({
              method: "POST",
              path: "register/adopt",
              body: { ids },
              apply: (state, result) => {
                if (!result.backupVerified)
                  throw Error("Sauvegarde non confirmée.");
                return { ...state, applications: result.applications };
              },
            }));
            setIds([]);
            setConfirmed(false);
          }}
        >
          <div className="space-y-3">
            {copies.map((app) => (
              <div key={app.id} className="border-t border-line pt-3">
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ids.includes(app.id)}
                    onChange={(event) => {
                      setIds((old) =>
                        event.target.checked
                          ? [...old, app.id]
                          : old.filter((id) => id !== app.id),
                      );
                      setConfirmed(false);
                    }}
                  />
                  {app.externalId} · {app.company} · {app.title}
                </label>
                <details className="mt-2 text-xs">
                  <summary>Vérifier les cellules et dates d’origine</summary>
                  <dl className="mt-2 space-y-2 break-words">
                    {Object.entries(app.register!.raw).map(([key, value]) => (
                      <div key={key}>
                        <dt className="font-medium">{key}</dt>
                        <dd>{value || "Inconnu"}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            ))}
          </div>
          <label className="mt-4 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            J’ai vérifié le rapprochement et les dates ; JobPilot devient le
            suivi principal de ces dossiers.
          </label>
          <p className="text-xs text-muted">
            Une sauvegarde chiffrée vérifiée précède l’adoption. Aucun
            changement du CSV ni de la tâche quotidienne ; sa bascule reste à
            confirmer au lot suivant.
          </p>
        </WriteForm>
      )}
      {!copies.length && (
        <p className="my-3 text-sm text-muted">
          Aucune copie CSV en attente d’adoption.
        </p>
      )}
      <Button className="app-button mt-4" onClick={() => void download()}>
        Télécharger le CSV compatible
      </Button>
      {exportError && <p role="alert">{exportError}</p>}
    </section>
  );
}

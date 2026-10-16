import { useCallback, useEffect, useState } from 'react';
import { isCacheSupported } from '../cache/opfsCache';
import { DocumentModal } from '../components/DocumentModal';
import { ensurePdfServiceWorker } from '../sw/pdfServiceWorker';

type Check = { label: string; ok: boolean | null; detail: string };

/** Quick checks shown on the start screen so setup problems are obvious before a demo. */
function useEnvironmentChecks(): Check[] {
  const [api, setApi] = useState<Check>({ label: 'Mock API server', ok: null, detail: 'Checking' });
  const [sw, setSw] = useState<Check>({ label: 'Local file server (service worker)', ok: null, detail: 'Checking' });
  const storageOk = isCacheSupported();

  useEffect(() => {
    fetch('/api/health')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setApi({
          label: 'Mock API server',
          ok: true,
          detail: `Connected through the dev-server proxy, default network “${data.defaultNetworkProfile}”`,
        });
      })
      .catch(() =>
        setApi({
          label: 'Mock API server',
          ok: false,
          detail: 'Not reachable. Start it with “npm start” in pdf-mock-server, or fix API_TARGET in .env.',
        })
      );

    ensurePdfServiceWorker()
      .then((ok) =>
        setSw({
          label: 'Local file server (service worker)',
          ok,
          detail: ok
            ? 'Active: documents are read from disk in small pieces'
            : 'Not active on this load. Reload normally (not Shift+Reload); documents still open, using more memory.',
        })
      )
      .catch(() => setSw({ label: 'Local file server (service worker)', ok: false, detail: 'Could not register.' }));
  }, []);

  return [
    api,
    {
      label: 'Disk storage (OPFS)',
      ok: storageOk,
      detail: storageOk ? 'Available for saving downloaded documents' : 'Not supported in this browser',
    },
    sw,
  ];
}

/** Start screen of the large-PDF POC: environment checks and the button that opens the document modal. */
export function DocumentReviewPage() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const checks = useEnvironmentChecks();

  const openModal = () => {
    setEverOpened(true);
    setOpen(true);
  };
  const closeModal = useCallback(() => setOpen(false), []);

  return (
    <main className="start">
      <div className="start__content">
        <h1>Large document preview</h1>
        <p className="start__lede">
          Proof of concept for opening medical record packets up to 1 GB without freezing the browser. Documents
          download once, stay on this device, and open page by page.
        </p>
        <button type="button" className="button button--large" onClick={openModal}>
          Review chase documents
        </button>

        <ul className="checks" aria-label="Environment checks">
          {checks.map((check) => (
            <li key={check.label} className={`check check--${check.ok === null ? 'pending' : check.ok ? 'ok' : 'fail'}`}>
              <span className="check__mark" aria-hidden="true" />
              <span>
                <strong>{check.label}</strong>
                <span className="check__detail">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Mounted on first open and then kept, so the viewer and any download survive closing the modal */}
      {everOpened && <DocumentModal open={open} onClose={closeModal} />}
    </main>
  );
}

// Modal dialogs: settings, how to play, science & sources, credits, educator view, archive, quiz, concept card.
import { useEffect, useState } from 'react';
import { SOURCES } from '../simulation/sources';
import type { Provenance } from '../simulation/types';
import { useStore, useT } from '../state/store';
import { CButton, Switch } from './components/Controls';
import { Modal } from './components/Shared';

const QUIZ_KEY: Record<string, number> = { q1: 1, q2: 2, q3: 0, q4: 1, q5: 1 }; // correct option indexes
const QUIZ_OPTS = ['a', 'b', 'c'];

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span>{label}</span>
      <Switch label={label} value={value ? 'on' : 'off'} onChange={(v) => onChange(v === 'on')} options={[{ value: 'off', label: t('common.off') }, { value: 'on', label: t('common.on') }]} />
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-40" />
    </label>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.setSettings);
  const resetAll = useStore((x) => x.resetAll);
  return (
    <Modal title={t('settings.title')} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between py-1 text-sm">
          <span>{t('settings.language')}</span>
          <Switch label={t('settings.language')} value={s.locale} onChange={(v) => set({ locale: v })} options={[{ value: 'en', label: 'English' }, { value: 'ms', label: 'Bahasa Melayu' }]} />
        </div>
        <Slider label={t('settings.sfx')} value={s.sfxVolume} onChange={(v) => set({ sfxVolume: v })} />
        <Slider label={t('settings.music')} value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} />
        <Toggle label={t('settings.mute')} value={s.muted} onChange={(v) => set({ muted: v })} />
        <Toggle label={t('settings.motion')} value={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
        <Toggle label={t('settings.contrast')} value={s.highContrast} onChange={(v) => set({ highContrast: v })} />
        <Toggle label={t('settings.instant')} value={s.instantText} onChange={(v) => set({ instantText: v })} />
        <p className="mt-2 text-xs text-muted">{t('settings.saved')}</p>
        <CButton variant="danger" size="sm" className="mt-2 self-start" onClick={() => window.confirm(t('settings.resetConfirm')) && void resetAll()}>
          {t('settings.reset')}
        </CButton>
      </div>
    </Modal>
  );
}

function HowToModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t('howto.title')} onClose={onClose}>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <li key={i}>{t(`howto.${i}`)}</li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">{t('howto.keys')}</p>
    </Modal>
  );
}

const PROV_ORDER: Provenance[] = ['NASA_GUIDE_VERIFIED', 'OTHER_REFERENCE_VERIFIED', 'EDUCATIONAL_SIMPLIFICATION', 'GAME_ASSUMPTION'];
const PROV_COLOR: Record<Provenance, string> = { NASA_GUIDE_VERIFIED: 'chip-pass', OTHER_REFERENCE_VERIFIED: 'chip-info', EDUCATIONAL_SIMPLIFICATION: 'chip-warning', GAME_ASSUMPTION: 'chip-fail' };

function SourcesModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t('sources.title')} onClose={onClose} wide>
      <p className="text-sm">{t('sources.intro')}</p>
      <div className="my-2 flex flex-wrap gap-2">
        {PROV_ORDER.map((p) => (
          <span key={p} className={`chip ${PROV_COLOR[p]}`}>
            {t(`sources.legend.${p}`)}
          </span>
        ))}
      </div>
      <h3 className="panel-title mt-3">{t('sources.models')}</h3>
      <ul className="mt-1 flex flex-col gap-1 text-xs text-muted">
        {['power', 'downlink', 'orbit', 'cloud', 'gsd'].map((k) => (
          <li key={k}>▸ {t(`sources.model.${k}`)}</li>
        ))}
      </ul>
      <p className="mt-2 border-l-2 border-amber pl-2 text-xs text-amber">{t('sources.legal')}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {SOURCES.map((s) => (
          <li key={s.id} className="border-b border-line pb-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip ${PROV_COLOR[s.provenance]}`}>{t(`sources.legend.${s.provenance}`)}</span>
              <span className="font-bold text-ink">{s.location}</span>
            </div>
            <div className="mt-0.5 text-muted">{t(`src.${s.id}`)}</div>
            <div className="text-dim">
              {s.title}
              {s.url && (
                <>
                  {' · '}
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-cyan underline">
                    {s.url}
                  </a>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-dim">{t('sources.pdf')}</p>
    </Modal>
  );
}

function CreditsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t('credits.title')} onClose={onClose}>
      <p className="text-sm">{t('credits.body')}</p>
      <p className="mt-2 text-sm">{t('credits.nasa')}</p>
      <p className="mt-2 text-sm text-amber">{t('credits.fiction')}</p>
    </Modal>
  );
}

function quizScore(ans: Readonly<Record<string, number>> | null) {
  if (!ans) return null;
  return Object.entries(QUIZ_KEY).filter(([q, c]) => ans[q] === c).length;
}

function ArchiveTable() {
  const t = useT();
  const archive = useStore((s) => s.archive);
  if (!archive.length) return <p className="text-sm text-muted">{t('archive.empty')}</p>;
  return (
    <table className="num w-full text-xs">
      <tbody>
        {[...archive].reverse().map((a, i) => (
          <tr key={i} className="border-t border-line">
            <td className="p-1">{new Date(a.at).toLocaleDateString()}</td>
            <td className="p-1">#{a.attempt}</td>
            <td className="p-1">{t(`obj.${a.objective}`)}</td>
            <td className="p-1">{t(`pkg.${a.pkgId}`)}</td>
            <td className={`p-1 ${a.kind === 'success' ? 'text-green' : a.kind === 'partial' ? 'text-amber' : 'text-red'}`}>{t(`debrief.${a.kind}`)}</td>
            <td className="p-1">{a.score}</td>
            <td className="p-1">{a.usable}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EducatorModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const archive = useStore((s) => s.archive);
  const learning = useStore((s) => s.learning);
  const best = archive.some((a) => a.kind === 'success') ? 'success' : archive.some((a) => a.kind === 'partial') ? 'partial' : archive.length ? 'failure' : null;
  const fixed = archive.reduce((a, x) => a + x.testsFixed, 0);
  const played = archive.length > 0;
  const objectivesReached = [played, learning.objectivesSeen.length > 0, played, played, played, archive.some((a) => a.usable > 0), fixed > 0 || learning.corrections > 0];
  const pre = quizScore(learning.quiz.pre);
  const post = quizScore(learning.quiz.post);
  const exportCsv = () => {
    const header = 'date,attempt,mode,objective,orbit,outcome,score,usable,testsFailed,testsFixed';
    const lines = archive.map((a) => [new Date(a.at).toISOString(), a.attempt, a.mode, a.objective, a.pkgId, a.kind, a.score, a.usable, a.testsFailed, a.testsFixed].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = 'borneo-sentinel-progress.csv';
    el.click();
    URL.revokeObjectURL(url);
  };
  const box = (label: string, value: string | number) => (
    <div className="border border-line p-2">
      <div className="engraved">{label}</div>
      <div className="text-xl">{value}</div>
    </div>
  );
  return (
    <Modal title={t('edu.title')} onClose={onClose} wide>
      <p className="text-xs text-amber">{t('edu.note')}</p>
      <div className="num mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {box(t('edu.attempts'), archive.length)}
        {box(t('edu.best'), best ? t(`debrief.${best}`) : '—')}
        {box(t('edu.fixed'), fixed)}
        {box(t('edu.decisions'), learning.decisions)}
      </div>
      <h3 className="panel-title mt-3">{t('edu.objectives')}</h3>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {objectivesReached.map((ok, i) => (
          <li key={i}>
            {ok ? '✔' : '○'} {t(`lo.${i + 1}`)}
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div>
          {t('edu.quizPre')}: <span className="num">{pre === null ? t('edu.notTaken') : `${pre}/5`}</span>
        </div>
        <div>
          {t('edu.quizPost')}: <span className="num">{post === null ? t('edu.notTaken') : `${post}/5`}</span>
        </div>
        <div>
          {t('edu.concepts')}: <span className="num">{learning.conceptsOpened.length}</span>
        </div>
      </div>
      <h3 className="panel-title mt-3">{t('edu.history')}</h3>
      <ArchiveTable />
      <div className="no-print mt-3 flex gap-2">
        <CButton size="sm" onClick={() => window.print()}>
          🖶 {t('common.print')}
        </CButton>
        <CButton size="sm" onClick={exportCsv} disabled={!archive.length}>
          ⤓ {t('common.export')}
        </CButton>
      </div>
    </Modal>
  );
}

function QuizModal({ which, onClose }: { which: 'pre' | 'post'; onClose: () => void }) {
  const t = useT();
  const record = useStore((s) => s.recordQuiz);
  const [ans, setAns] = useState<Record<string, number>>({});
  const [done, setDone] = useState<number | null>(null);
  return (
    <Modal title={t('quiz.title')} onClose={onClose}>
      <p className="mb-2 text-xs text-muted">{t('quiz.note')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          record(which, ans);
          setDone(quizScore(ans));
        }}
      >
        {Object.keys(QUIZ_KEY).map((q) => (
          <fieldset key={q} className="mb-3">
            <legend className="text-sm font-bold">{t(`quiz.${q}`)}</legend>
            {QUIZ_OPTS.map((o, i) => (
              <label key={o} className={`mt-1 flex items-center gap-2 text-sm ${done !== null && QUIZ_KEY[q] === i ? 'text-green' : ''}`}>
                <input type="radio" name={q} checked={ans[q] === i} onChange={() => setAns({ ...ans, [q]: i })} disabled={done !== null} />
                {t(`quiz.${q}.${o}`)}
              </label>
            ))}
          </fieldset>
        ))}
        {done === null ? (
          <button type="submit" className="cbtn cbtn-primary">
            {t('quiz.submit')}
          </button>
        ) : (
          <p className="text-sm text-yellow">{t('quiz.score', { n: done, total: 5 })}</p>
        )}
      </form>
    </Modal>
  );
}

function LearnModal({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const conceptOpened = useStore((s) => s.conceptOpened);
  useEffect(() => conceptOpened(id), [id, conceptOpened]);
  return (
    <Modal title={t(`concept.${id}`)} onClose={onClose}>
      <p className="text-sm leading-relaxed">{t(`concept.${id}.b`)}</p>
    </Modal>
  );
}

export function Modals() {
  const modal = useStore((s) => s.modal);
  const open = useStore((s) => s.openModal);
  const t = useT();
  if (!modal) return null;
  const close = () => open(null);
  switch (modal.kind) {
    case 'settings':
      return <SettingsModal onClose={close} />;
    case 'howto':
      return <HowToModal onClose={close} />;
    case 'sources':
      return <SourcesModal onClose={close} />;
    case 'credits':
      return <CreditsModal onClose={close} />;
    case 'educator':
      return <EducatorModal onClose={close} />;
    case 'archive':
      return (
        <Modal title={t('archive.title')} onClose={close} wide>
          <ArchiveTable />
        </Modal>
      );
    case 'quiz':
      return <QuizModal which={modal.which} onClose={close} />;
    case 'learn':
      return <LearnModal id={modal.id} onClose={close} />;
  }
}

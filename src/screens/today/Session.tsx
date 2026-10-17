import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { announce, now, remainingMs, unlockAudio } from '../../effects';
import { fmtDate, fmtDuration, fmtKg, fmtNum, t, type MessageKey } from '../../i18n';
import type { DateKey } from '../../lib/dates';
import { deloadKg, moveKey, type PlannedDay } from '../../lib/program';
import { isNewThisPhase, lastBefore, lastInEarlierPhase, lastKg, progressionSuggestion } from '../../lib/progress';
import { COOLDOWN_ROUTINE, exerciseFor, exerciseImages, exerciseIndex, loadExerciseIndex, WARMUP_ROUTINE, type RoutineItem } from '../../lib/exercises';
import { buildSteps, currentStep, type Step, type TimedStepKind } from '../../lib/session';
import type { DayLog, MoveLog } from '../../lib/types';
import { KG_MAX, validKg, validReps } from '../../lib/validate';
import {
  active,
  adjustTimer,
  finishSession,
  histories,
  logSet,
  markPartial,
  pauseTimer,
  program,
  renameMove,
  resumeTimer,
  setDraft,
  setMoveSkipped,
  setStepDone,
  settings,
  skipTimer,
  startRest,
  startSession,
  startTimer,
  today,
  undoSet,
} from '../../state';
import { Button, Dialog, Stamp } from '../../ui/components';
import { Icon } from '../../ui/icons';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function Session({ plan, log }: { plan: PlannedDay; log: DayLog | undefined }) {
  const spec = program.value.session;
  const steps = buildSteps(plan, log, spec);
  const current = currentStep(steps);
  const started = !!log && log.status === 'active';
  const [open, setOpen] = useState<number>(current === -1 ? steps.length - 1 : current);
  const lastCurrent = useRef(current);

  // Follow the current step as the session moves on.
  useEffect(() => {
    if (current !== lastCurrent.current) {
      lastCurrent.current = current;
      if (current !== -1) setOpen(current);
    }
  }, [current]);

  const focus = steps[open] ?? steps[0];

  return (
    <>
      <ol class="steps" aria-label={t('session.steps')}>
        {steps.map((s) => (
          <StepRow
            key={s.index}
            step={s}
            plan={plan}
            isCurrent={s.index === current && (started || s.index === 0)}
            isOpen={s.index === open}
            onOpen={() => setOpen(s.index)}
            date={plan.date}
          />
        ))}
      </ol>
      <Dock plan={plan} log={log} steps={steps} current={current} focus={focus} started={started} />
    </>
  );
}

function stepTitle(s: Step): string {
  if (s.kind === 'warmup') return t('session.warmup');
  if (s.kind === 'cardio') return t('session.cardio');
  if (s.kind === 'cooldown') return t('session.cooldown');
  return s.move!.name;
}

function StepRow({
  step,
  plan,
  isCurrent,
  isOpen,
  onOpen,
  date,
}: {
  step: Step;
  plan: PlannedDay;
  isCurrent: boolean;
  isOpen: boolean;
  onOpen: () => void;
  date: DateKey;
}) {
  const spec = program.value.session;
  const id = useId();
  const sub =
    step.kind === 'warmup'
      ? t('session.minutes', { n: spec.warmupMin })
      : step.kind === 'cardio'
        ? t('session.minutes', { n: spec.cardioMin })
        : step.kind === 'cooldown'
          ? t('session.minutes', { n: spec.cooldownMin })
          : t('session.setsReps', { sets: spec.sets, reps: spec.reps }) + (step.move!.bodyweight ? ` · ${t('session.bodyweight')}` : '');
  const state = step.done ? 'done' : step.skipped ? 'skipped' : step.kind === 'move' && step.setsDone ? 'partial' : '';
  return (
    <li class={`step${isCurrent ? ' is-current' : ''}${isOpen ? ' is-open' : ''}${state ? ` is-${state}` : ''}`}>
      <h3 class="step-head">
        <button type="button" class="step-toggle" aria-expanded={isOpen} aria-controls={`${id}-p`} onClick={onOpen}>
          <span class="step-num mono" aria-hidden="true">
            {pad2(step.index + 1)}
          </span>
          <span class="step-title">
            <span class="step-name">{stepTitle(step)}</span>
            <span class="step-sub">{sub}</span>
          </span>
          <span class="step-state">
            {isCurrent && <Stamp accent>{t('session.now')}</Stamp>}
            {step.kind === 'move' && !step.done && !step.skipped && (
              <span class="mono step-count">
                {step.setsDone}/{spec.sets}
              </span>
            )}
            {step.done && <Icon name="check" size={20} label={t('status.done')} />}
            {step.skipped && <span class="step-skipped">{t('session.skipped')}</span>}
          </span>
        </button>
      </h3>
      {isOpen && (
        <div class="step-panel" id={`${id}-p`}>
          {step.kind === 'move' ? (
            <MoveDetail plan={plan} step={step} date={date} />
          ) : (
            <TimedStepDetail step={step} date={date} />
          )}
        </div>
      )}
    </li>
  );
}

const TIMED_HINT = { warmup: 'session.warmupHint', cardio: 'session.cardioHint', cooldown: 'session.cooldownHint' } as const;
const TIMED_DONE = { warmup: 'session.warmupDone', cardio: 'session.cardioDone', cooldown: 'session.cooldownDone' } as const;

function TimedStepDetail({ step, date }: { step: Step; date: DateKey }) {
  const kind = step.kind as TimedStepKind;
  const routine = kind === 'warmup' ? WARMUP_ROUTINE : kind === 'cooldown' ? COOLDOWN_ROUTINE : null;
  return (
    <div class="timed-detail">
      <p class="hint">{t(TIMED_HINT[kind])}</p>
      {routine && <Routine items={routine} />}
      {step.done && (
        <Button variant="text" icon="undo" onClick={() => setStepDone(date, kind, false)}>
          {t('session.markNotDone')}
        </Button>
      )}
    </div>
  );
}

function Routine({ items }: { items: RoutineItem[] }) {
  return (
    <ol class="routine">
      {items.map((r) => (
        <li key={r.id}>
          <details class="routine-item">
            <summary>
              <Thumb id={r.id} />
              <span class="routine-name">{r.name}</span>
              <span class="routine-dose mono">{r.dose}</span>
            </summary>
            <ExerciseFigure id={r.id} name={r.name} />
          </details>
        </li>
      ))}
    </ol>
  );
}

/** Small first-frame picture; an empty box if it can't load (offline on first view). */
function Thumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span class="routine-thumb" aria-hidden="true" />;
  return (
    <img
      class="routine-thumb"
      src={exerciseImages(id)[0]}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
    />
  );
}

/** Start and end position photos. Renders nothing when they can't load. */
export function ExerciseFigure({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  if (failed) return null;
  return (
    <figure class="ex-figure">
      {exerciseImages(id).map((src, i) => (
        <img
          key={src}
          src={src}
          alt={t(i === 0 ? 'move.photoStart' : 'move.photoEnd', { name })}
          width={250}
          height={250}
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
          onError={() => setFailed(true)}
        />
      ))}
    </figure>
  );
}

function moveInfo(plan: PlannedDay, move: MoveLog, moveIdx: number) {
  const h = histories.value.get(moveKey(move.name));
  const last = lastBefore(h, plan.date);
  const prefill = lastKg(h, plan.date);
  const isNew = isNewThisPhase(program.value, plan, moveIdx);
  const earlier = isNew ? lastInEarlierPhase(h, plan) : null;
  const s = settings.value;
  const deload = plan.deload && prefill !== null && !move.bodyweight ? deloadKg(prefill, s.deloadPct) : null;
  const progression =
    s.progression && !plan.deload ? progressionSuggestion(h, plan.date, program.value.session, s.progressionStepKg) : null;
  return { last, prefill, isNew, earlier, deload, progression };
}

function MoveDetail({ plan, step, date }: { plan: PlannedDay; step: Step; date: DateKey }) {
  const move = step.move!;
  const spec = program.value.session;
  const info = moveInfo(plan, move, step.moveIdx);
  const [rename, setRename] = useState(false);
  void exerciseIndex.value; // re-render once the name index has loaded
  const imageId = exerciseFor(move.name);
  useEffect(() => {
    if (!imageId) loadExerciseIndex();
  }, [imageId]);
  const timer = active.value?.date === date ? active.value.timer : null;
  const manualRest = !settings.value.autoStart && date === today.value && move.sets.length > 0 && !timer;

  return (
    <div class="move-detail">
      {imageId && <ExerciseFigure id={imageId} name={move.name} />}
      <div class="move-tags">
        {info.isNew && <Stamp>{t('move.new')}</Stamp>}
        {info.deload !== null && <Stamp>{t('move.deloadSuggest', { kg: fmtNum(info.deload, 1), pct: settings.value.deloadPct })}</Stamp>}
        {info.progression !== null && <Stamp>{t('move.tryKg', { kg: fmtNum(info.progression, 1) })}</Stamp>}
      </div>
      <dl class="move-last">
        <div>
          <dt>{t('move.lastTime')}</dt>
          <dd class="mono">
            {info.last
              ? move.bodyweight
                ? t('move.lastBodyweight', { reps: info.last.reps, sets: info.last.sets })
                : t('move.lastValue', { kg: fmtKg(info.last.kg), reps: info.last.reps })
              : t('move.firstTime')}
            {info.last && <span class="move-last-date"> · {fmtDate(info.last.date)}</span>}
          </dd>
        </div>
        {info.earlier && (
          <div>
            <dt>{t('move.earlierPhase')}</dt>
            <dd class="mono">
              {t('move.lastValue', { kg: fmtKg(info.earlier.kg), reps: info.earlier.reps })} · {fmtDate(info.earlier.date)}
            </dd>
          </div>
        )}
      </dl>

      <SetCells move={move} target={spec.sets} />

      <div class="move-actions">
        {manualRest && (
          <Button variant="secondary" icon="timer" onClick={() => startRest(step.moveIdx, move.sets.length >= spec.sets)}>
            {t('move.restTimer')}
          </Button>
        )}
        {move.sets.length > 0 && (
          <Button variant="text" icon="undo" onClick={() => undoSet(date, step.moveIdx)}>
            {t('move.undoSet')}
          </Button>
        )}
        <Button variant="text" icon="skip" onClick={() => setMoveSkipped(date, step.moveIdx, !move.skipped)}>
          {move.skipped ? t('move.unskip') : t('move.skip')}
        </Button>
        <Button variant="text" icon="edit" onClick={() => setRename(true)}>
          {t('move.rename')}
        </Button>
      </div>
      <RenameDialog
        open={rename}
        onClose={() => setRename(false)}
        name={move.name}
        bodyweight={move.bodyweight}
        onSave={(name, bw) => renameMove(date, step.moveIdx, name, bw)}
      />
    </div>
  );
}

export function SetCells({ move, target }: { move: MoveLog; target: number }) {
  const cells = Math.max(target, move.sets.length);
  return (
    <ol class="set-cells" aria-label={t('move.setsLabel', { done: move.sets.length, target })}>
      {Array.from({ length: cells }, (_, i) => {
        const s = move.sets[i];
        return (
          <li key={i} class={`set-cell${s ? ' filled' : ''}`}>
            <span class="set-cell-n">{i + 1}</span>
            <span class="set-cell-v mono" aria-hidden="true">
              {!s ? (
                '–'
              ) : move.bodyweight || s.kg === null ? (
                t('move.cellBw', { reps: s.reps })
              ) : (
                <>
                  <span>{fmtKg(s.kg)}</span>
                  <span class="set-cell-reps">{t('move.cellReps', { reps: s.reps })}</span>
                </>
              )}
            </span>
            <span class="visually-hidden">
              {s
                ? move.bodyweight || s.kg === null
                  ? t('move.setDoneBw', { n: i + 1, reps: s.reps })
                  : t('move.setDone', { n: i + 1, kg: fmtKg(s.kg), reps: s.reps })
                : t('move.setTodo', { n: i + 1 })}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RenameDialog({
  open,
  onClose,
  name,
  bodyweight,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  bodyweight: boolean;
  onSave: (name: string, bodyweight: boolean) => void;
}) {
  const [value, setValue] = useState(name);
  const [bw, setBw] = useState(bodyweight);
  const id = useId();
  useEffect(() => {
    setValue(name);
    setBw(bodyweight);
  }, [open, name, bodyweight]);
  const ok = value.trim().length > 0;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('move.renameTitle')}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              onSave(value, bw);
              onClose();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <p class="hint">{t('move.renameHint')}</p>
      <div class="field">
        <label for={id}>{t('move.name')}</label>
        <input id={id} class="input" value={value} maxLength={80} onInput={(e) => setValue(e.currentTarget.value)} />
      </div>
      <label class="check-row">
        <input type="checkbox" checked={bw} onChange={(e) => setBw(e.currentTarget.checked)} />
        <span>{t('move.isBodyweight')}</span>
      </label>
    </Dialog>
  );
}

// ─── Dock: timer + the one primary action, pinned above the tab bar ─────────

function Dock({
  plan,
  log,
  steps,
  current,
  focus,
  started,
}: {
  plan: PlannedDay;
  log: DayLog | undefined;
  steps: Step[];
  current: number;
  focus: Step;
  started: boolean;
}) {
  const [finishAsk, setFinishAsk] = useState(false);
  const spec = program.value.session;
  const date = plan.date;
  const timer = active.value?.date === date ? active.value.timer : null;
  const allDone = current === -1;
  const doneSets = steps.reduce((a, s) => a + (s.kind === 'move' ? s.setsDone : 0), 0);
  const totalSets = steps.filter((s) => s.kind === 'move').length * spec.sets;

  let action;
  if (!started && !(log && (log.status === 'partial' || log.status === 'done'))) {
    action = (
      <Button
        variant="primary"
        class="btn-xl"
        icon="play"
        onClick={() => {
          unlockAudio();
          startSession(date);
        }}
      >
        {t('session.start')}
      </Button>
    );
  } else if (allDone) {
    action = (
      <Button variant="primary" class="btn-xl" icon="check" onClick={() => finishSession(date)}>
        {t('session.finish')}
      </Button>
    );
  } else if (focus.kind === 'move' && !focus.skipped) {
    action = <SetForm plan={plan} step={focus} />;
  } else if (focus.kind === 'warmup' || focus.kind === 'cardio' || focus.kind === 'cooldown') {
    const kind = focus.kind;
    const running = timer?.kind === kind;
    const minutes = kind === 'warmup' ? spec.warmupMin : kind === 'cardio' ? spec.cardioMin : spec.cooldownMin;
    action = (
      <div class="dock-row">
        {!running && !focus.done && (
          <Button variant="secondary" icon="timer" onClick={() => startTimer(kind, focus.index)}>
            {t('session.startTimer', { time: fmtDuration(minutes * 60_000) })}
          </Button>
        )}
        <Button
          variant="primary"
          class="btn-grow"
          icon="check"
          onClick={() => setStepDone(date, kind, !focus.done)}
          disabled={focus.done}
        >
          {t(TIMED_DONE[kind])}
        </Button>
      </div>
    );
  } else {
    action = null;
  }

  return (
    <div class="dock" role="region" aria-label={t('session.controls')}>
      {timer && <TimerBlock />}
      <div class="dock-main">{action}</div>
      {started && !allDone && (
        <div class="dock-foot">
          <span class="mono hint">{t('session.setsProgress', { done: doneSets, total: totalSets })}</span>
          <Button variant="text" onClick={() => setFinishAsk(true)}>
            {t('session.finishEarly')}
          </Button>
        </div>
      )}
      <Dialog
        open={finishAsk}
        onClose={() => setFinishAsk(false)}
        title={t('session.finishEarlyTitle')}
        actions={
          <>
            <Button variant="text" onClick={() => setFinishAsk(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                markPartial(date);
                setFinishAsk(false);
              }}
            >
              {t('session.saveAsPartial')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                finishSession(date);
                setFinishAsk(false);
              }}
            >
              {t('session.markDone')}
            </Button>
          </>
        }
      >
        <p>{t('session.finishEarlyBody', { done: doneSets, total: totalSets })}</p>
      </Dialog>
    </div>
  );
}

function SetForm({ plan, step }: { plan: PlannedDay; step: Step }) {
  const move = step.move!;
  const spec = program.value.session;
  const info = moveInfo(plan, move, step.moveIdx);
  const lastSetKg = move.sets.length ? move.sets[move.sets.length - 1].kg : null;
  // The latest weight for this move (this session, else last time) is the placeholder;
  // logging with the field left empty uses it.
  const lastUsedKg = lastSetKg ?? info.prefill;
  const draft = active.value?.drafts[step.moveIdx];
  const [kg, setKg] = useState(draft?.kg ?? '');
  const kgHintId = useId();
  const [reps, setReps] = useState(draft?.reps ?? String(spec.reps));
  const [error, setError] = useState<MessageKey | null>(null);
  const kgId = useId();
  const repsId = useId();
  const errId = useId();

  // New move in focus → reset fields to that move's defaults.
  useEffect(() => {
    const d = active.value?.drafts[step.moveIdx];
    setKg(d?.kg ?? '');
    setReps(d?.reps ?? String(spec.reps));
    setError(null);
  }, [step.moveIdx, move.name]);

  const submit = (e: Event) => {
    e.preventDefault();
    unlockAudio();
    const r = validReps(reps);
    if (r === null || r === 0) return setError('form.repsInvalid');
    let k: number | null = null;
    if (!move.bodyweight) {
      k = kg.trim() === '' && lastUsedKg !== null ? lastUsedKg : validKg(kg);
      if (k === null) return setError('form.kgInvalid');
    }
    setError(null);
    logSet(plan.date, step.moveIdx, k, r);
    announce(
      move.bodyweight
        ? t('move.loggedBw', { n: move.sets.length + 1, reps: r })
        : t('move.logged', { n: move.sets.length + 1, kg: fmtKg(k), reps: r }),
    );
    setReps(String(spec.reps));
    setKg('');
    persist('', String(spec.reps));
  };

  const persist = (k: string, r: string) => setDraft(step.moveIdx, k, r);
  const stepReps = (d: number) => {
    const n = Math.max(1, Math.min(100, (validReps(reps) ?? spec.reps) + d));
    setReps(String(n));
    persist(kg, String(n));
  };

  return (
    <form class="set-form" onSubmit={submit} noValidate>
      {!move.bodyweight && (
        <div class="field field-kg">
          <label for={kgId}>{t('form.kg')}</label>
          <input
            id={kgId}
            class="input input-num mono"
            inputMode="decimal"
            enterKeyHint="done"
            autocomplete="off"
            value={kg}
            aria-invalid={error === 'form.kgInvalid'}
            aria-describedby={[error ? errId : '', lastUsedKg !== null ? kgHintId : ''].filter(Boolean).join(' ') || undefined}
            placeholder={lastUsedKg !== null ? fmtNum(lastUsedKg, 2) : '0'}
            onInput={(e) => {
              setKg(e.currentTarget.value);
              persist(e.currentTarget.value, reps);
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          {lastUsedKg !== null && (
            <span id={kgHintId} class="visually-hidden">
              {t('form.kgLast', { kg: fmtKg(lastUsedKg) })}
            </span>
          )}
        </div>
      )}
      <div class="field field-reps">
        <label for={repsId}>{t('form.reps')}</label>
        <div class="stepper">
          <button type="button" class="icon-btn" onClick={() => stepReps(-1)} aria-label={t('form.repsLess')}>
            <Icon name="minus" size={18} />
          </button>
          <input
            id={repsId}
            class="input input-num mono"
            inputMode="numeric"
            autocomplete="off"
            value={reps}
            aria-invalid={error === 'form.repsInvalid'}
            aria-describedby={error ? errId : undefined}
            onInput={(e) => {
              setReps(e.currentTarget.value);
              persist(kg, e.currentTarget.value);
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" class="icon-btn" onClick={() => stepReps(1)} aria-label={t('form.repsMore')}>
            <Icon name="plus" size={18} />
          </button>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-set">
        <span class="btn-set-label">{t('move.logSet', { n: Math.min(move.sets.length + 1, 99), target: spec.sets })}</span>
        <span class="btn-set-move">{move.name}</span>
      </button>
      {error && (
        <p class="form-error" id={errId} role="alert">
          {t(error, { max: KG_MAX })}
        </p>
      )}
    </form>
  );
}

function TimerBlock() {
  const timer = active.value?.timer;
  void now.value; // re-render on tick
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onEnd = () => {
      const el = ref.current;
      if (!el) return;
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    };
    document.addEventListener('timer-end', onEnd);
    return () => document.removeEventListener('timer-end', onEnd);
  }, []);
  if (!timer) return null;
  const left = remainingMs(timer);
  const paused = timer.pausedRemaining !== undefined;
  const over = left <= 0;
  const label = t(`timer.${timer.kind}` as MessageKey);
  const pct = Math.max(0, Math.min(1, 1 - left / timer.durationMs));
  return (
    <div class={`timer${over ? ' is-over' : ''}${paused ? ' is-paused' : ''}`} ref={ref}>
      <div class="timer-bar" style={{ transform: `scaleX(${pct})` }} aria-hidden="true" />
      <div class="timer-main">
        <p class="timer-label">
          {label}
          {paused && ` · ${t('timer.paused')}`}
        </p>
        <p class="timer-time mono" role="timer" aria-label={t('timer.remaining', { label, time: fmtDuration(left) })}>
          {over ? t('timer.done') : fmtDuration(left)}
        </p>
      </div>
      <div class="timer-ctrl">
        <button type="button" class="icon-btn mono" onClick={() => adjustTimer(-30_000)} aria-label={t('timer.minus30')}>
          −30
        </button>
        <button
          type="button"
          class="icon-btn"
          onClick={() => (paused ? resumeTimer() : pauseTimer())}
          aria-label={paused ? t('timer.resume') : t('timer.pause')}
          disabled={over}
        >
          <Icon name={paused ? 'play' : 'pause'} size={20} />
        </button>
        <button type="button" class="icon-btn mono" onClick={() => adjustTimer(30_000)} aria-label={t('timer.plus30')}>
          +30
        </button>
        <button type="button" class="icon-btn" onClick={() => skipTimer()} aria-label={over ? t('timer.close') : t('timer.skip')}>
          <Icon name={over ? 'close' : 'skip'} size={20} />
        </button>
      </div>
    </div>
  );
}

import { useId, useMemo, useState } from 'preact/hooks';
import { fmtDate, fmtDuration, t, type MessageKey } from '../i18n';
import { isDateKey, type Weekday } from '../lib/dates';
import {
  defaultMovesPerDay,
  generateProgram,
  goalSession,
  MAX_DAYS,
  MAX_MOVES,
  MIN_MOVES,
  sanitizeAnswers,
  WEEK_OPTIONS,
  type Experience,
  type Goal,
  type SetupAnswers,
} from '../lib/generator';
import type { Equip } from '../lib/library';
import { go } from '../router';
import { applySetup, meta, requestPersistence, settings, today } from '../state';
import { Button, Segmented, Toggle } from '../ui/components';
import { Icon } from '../ui/icons';

const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const STEPS = 5;

/** First-run (and "Re-run setup") wizard: a few questions → a generated plan. */
export default function Setup() {
  const rerun = meta.value.firstRunDone;
  const [a, setA] = useState<SetupAnswers>(() => sanitizeAnswers(meta.value.setupAnswers, today.value));
  const [counters, setCounters] = useState(settings.value.counters);
  // Moves per day follows the number of days until the user picks a number themselves.
  const [movesTouched, setMovesTouched] = useState(false);
  const [step, setStep] = useState(0);
  const program = useMemo(() => generateProgram(a), [a]);

  const set = (patch: Partial<SetupAnswers>) =>
    setA((prev) => {
      const next = { ...prev, ...patch };
      if (!movesTouched && (patch.days || patch.experience)) next.movesPerDay = defaultMovesPerDay(next.days.length, next.experience);
      if (patch.goal || patch.experience) next.cardioMin = goalSession(next.goal, next.experience).cardioMin;
      if (patch.days) next.cardioDays = next.cardioDays.filter((d) => !next.days.includes(d));
      return next;
    });

  const finish = async () => {
    await applySetup(program, a, { counters });
    if (!rerun) void requestPersistence();
    go({ name: 'today' });
  };
  const cancel = () => go(rerun ? { name: 'settings', section: 'program' } : { name: 'today' });
  const canNext = step !== 1 || a.days.length > 0;

  return (
    <div class="setup">
      <header class="sheet-head">
        <p class="sheet-date mono">{t('setup.step', { n: step + 1, total: STEPS })}</p>
        <h1 class="sheet-title" tabIndex={-1}>
          {t(rerun ? 'setup.rerunTitle' : 'setup.title')}
        </h1>
        <div class="setup-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${(step + 1) / STEPS})` }} />
        </div>
      </header>

      {step === 0 && <GoalStep a={a} set={set} />}
      {step === 1 && <DaysStep a={a} set={set} />}
      {step === 2 && (
        <SessionStep
          a={a}
          set={set}
          onMoves={(n) => {
            setMovesTouched(true);
            set({ movesPerDay: n });
          }}
        />
      )}
      {step === 3 && <ScheduleStep a={a} set={set} counters={counters} setCounters={setCounters} />}
      {step === 4 && <ReviewStep a={a} set={set} program={program} rerun={rerun} />}

      <div class="setup-nav">
        {step === 0 ? (
          <Button variant="text" onClick={cancel}>
            {t('setup.cancel')}
          </Button>
        ) : (
          <Button variant="text" icon="left" onClick={() => setStep(step - 1)}>
            {t('setup.back')}
          </Button>
        )}
        {step < STEPS - 1 ? (
          <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            {t('setup.next')}
          </Button>
        ) : (
          <Button variant="primary" icon="check" onClick={() => void finish()}>
            {t('setup.start')}
          </Button>
        )}
      </div>
    </div>
  );
}

type StepProps = { a: SetupAnswers; set: (p: Partial<SetupAnswers>) => void };

/** Big tappable radio rows with a hint line. */
function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="choices" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={`choice${o.value === value ? ' on' : ''}`}
          onClick={() => onChange(o.value)}
          key={o.value}
        >
          <span class="choice-mark" aria-hidden="true">
            {o.value === value && <Icon name="check" size={18} />}
          </span>
          <span class="choice-text">
            <span class="choice-label">{o.label}</span>
            {o.hint && <span class="hint">{o.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Seven toggle chips, Monday first. */
function DayChips({
  label,
  selected,
  available = WEEK,
  max,
  onChange,
}: {
  label: string;
  selected: Weekday[];
  available?: Weekday[];
  max?: number;
  onChange: (days: Weekday[]) => void;
}) {
  return (
    <div class="day-chips" role="group" aria-label={label}>
      {WEEK.map((d) => {
        const on = selected.includes(d);
        const disabled = !available.includes(d) || (!on && max !== undefined && selected.length >= max);
        return (
          <button
            type="button"
            key={d}
            class={`day-chip${on ? ' on' : ''}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? selected.filter((x) => x !== d) : [...selected, d])}
          >
            <span aria-hidden="true">{t(`weekday.${d}` as MessageKey).slice(0, 3)}</span>
            <span class="visually-hidden">{t(`weekday.${d}` as MessageKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const id = useId();
  return (
    <div class="field field-inline setup-stepper">
      <span id={id}>{label}</span>
      <div class="stepper" role="group" aria-labelledby={id}>
        <button type="button" class="icon-btn" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`${label} −1`}>
          <Icon name="minus" size={18} />
        </button>
        <output class="mono stepper-value" aria-live="polite">
          {value}
        </output>
        <button type="button" class="icon-btn" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`${label} +1`}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}

function GoalStep({ a, set }: StepProps) {
  return (
    <section class="setup-step">
      <h2 class="section-label">{t('setup.goalTitle')}</h2>
      <Choices<Goal>
        label={t('setup.goalTitle')}
        value={a.goal}
        onChange={(goal) => set({ goal })}
        options={(['muscle', 'strength', 'fitness', 'fatloss'] as const).map((g) => ({
          value: g,
          label: t(`setup.goal.${g}`),
          hint: t(`setup.goal.${g}Hint`),
        }))}
      />
      <h2 class="section-label">{t('setup.experience')}</h2>
      <Segmented<Experience>
        label={t('setup.experience')}
        value={a.experience}
        onChange={(experience) => set({ experience })}
        options={(['beginner', 'intermediate', 'advanced'] as const).map((e) => ({ value: e, label: t(`setup.exp.${e}`) }))}
      />
      <p class="hint">{t('setup.expHint')}</p>
      <p class="hint setup-offline">{t('setup.offline')}</p>
    </section>
  );
}

function splitKey(n: number): MessageKey {
  return n <= 3 ? 'setup.split.full' : n === 4 ? 'setup.split.upperLower' : n === 5 ? 'setup.split.ppl5' : 'setup.split.ppl6';
}

function DaysStep({ a, set }: StepProps) {
  return (
    <section class="setup-step">
      <h2 class="section-label">{t('setup.daysTitle')}</h2>
      <DayChips label={t('setup.daysTitle')} selected={a.days} max={MAX_DAYS} onChange={(days) => set({ days })} />
      <p class="hint">{a.days.length >= MAX_DAYS ? t('setup.daysMax') : t('setup.daysHint')}</p>
      {a.days.length > 0 && <p class="setup-split">{t('setup.split', { split: t(splitKey(a.days.length)) })}</p>}
      <h2 class="section-label">{t('setup.equipTitle')}</h2>
      <Choices<Equip>
        label={t('setup.equipTitle')}
        value={a.equip}
        onChange={(equip) => set({ equip })}
        options={(['gym', 'dumbbell', 'bodyweight'] as const).map((e) => ({
          value: e,
          label: t(`setup.equip.${e}`),
          hint: t(`setup.equip.${e}Hint`),
        }))}
      />
    </section>
  );
}

function SessionStep({ a, set, onMoves }: StepProps & { onMoves: (n: number) => void }) {
  const g = goalSession(a.goal, a.experience);
  return (
    <section class="setup-step">
      <h2 class="section-label">{t('setup.sessionTitle')}</h2>
      <Stepper label={t('setup.movesPerDay')} value={a.movesPerDay} min={MIN_MOVES} max={MAX_MOVES} onChange={onMoves} />
      <p class="hint">{t('setup.movesHint')}</p>
      <Stepper label={t('setup.warmupMin')} value={a.warmupMin} min={0} max={30} onChange={(warmupMin) => set({ warmupMin })} />
      <Stepper label={t('setup.cardioMin')} value={a.cardioMin} min={0} max={60} onChange={(cardioMin) => set({ cardioMin })} />
      <Stepper label={t('setup.cooldownMin')} value={a.cooldownMin} min={0} max={30} onChange={(cooldownMin) => set({ cooldownMin })} />
      <p class="setup-split mono">{t('setup.shape', { sets: g.sets, reps: g.reps, rest: fmtDuration(g.restSetSec * 1000) })}</p>
    </section>
  );
}

function ScheduleStep({ a, set, counters, setCounters }: StepProps & { counters: boolean; setCounters: (v: boolean) => void }) {
  const id = useId();
  const restDays = WEEK.filter((d) => !a.days.includes(d));
  return (
    <section class="setup-step">
      <h2 class="section-label">{t('setup.cardioDays')}</h2>
      {restDays.length ? (
        <>
          <DayChips label={t('setup.cardioDays')} selected={a.cardioDays} available={restDays} onChange={(cardioDays) => set({ cardioDays })} />
          <p class="hint">{t('setup.cardioDaysHint')}</p>
        </>
      ) : (
        <p class="hint">{t('setup.cardioDaysNone')}</p>
      )}
      <h2 class="section-label">{t('setup.weeks')}</h2>
      <Segmented<string>
        label={t('setup.weeks')}
        value={String(a.weeks)}
        onChange={(v) => set({ weeks: Number(v) })}
        options={WEEK_OPTIONS.map((n) => ({ value: String(n), label: t('setup.weeksN', { n }) }))}
      />
      <p class="hint">{t('setup.weeksHint')}</p>
      <div class="field">
        <label for={id}>{t('setup.startDate')}</label>
        <input
          id={id}
          type="date"
          class="input mono"
          value={a.startDate}
          min={today.value}
          onInput={(e) => {
            const v = e.currentTarget.value;
            if (isDateKey(v) && v >= today.value) set({ startDate: v });
          }}
        />
      </div>
      <Toggle label={t('setup.counters')} checked={counters} onChange={setCounters} />
    </section>
  );
}

function ReviewStep({ a, set, program, rerun }: StepProps & { program: ReturnType<typeof generateProgram>; rerun: boolean }) {
  const first = program.phases[0];
  return (
    <section class="setup-step">
      <h2 class="section-label">{t('setup.reviewTitle')}</h2>
      <p class="hint">
        {t('setup.reviewHint', { phases: program.phases.length, start: fmtDate(program.startDate), end: fmtDate(program.endDate) })}
      </p>
      {rerun && <p class="hint">{t('setup.rerunNote')}</p>}
      <Button variant="secondary" icon="swap" class="setup-shuffle" onClick={() => set({ seed: a.seed + 1 })}>
        {t('setup.shuffle')}
      </Button>
      <ol class="setup-week">
        {WEEK.map((wd) => {
          const w = program.weekdays[wd];
          const moves = program.moves[first.id]?.[wd] ?? [];
          const cardio = !w.rest && !moves.length;
          return (
            <li key={wd} class={w.rest ? 'is-rest' : ''}>
              <span class="setup-wd">{t(`weekday.${wd}` as MessageKey).slice(0, 3)}</span>
              <div>
                <p class="setup-focus">{w.rest ? t('today.restDay') : cardio ? t('setup.cardioDay') : w.focus}</p>
                {moves.length > 0 && (
                  <ol class="setup-moves">
                    {moves.map((m) => (
                      <li key={m.name}>{m.name}</li>
                    ))}
                  </ol>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

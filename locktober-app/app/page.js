'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './page.module.css';

const GOAL_COLORS = ['#3a5fb5', '#2f6f4f', '#b5482f', '#a3762a', '#6b4fa0'];
const HISTORY_DAYS = 120;
const MAX_MONTHS_BACK = 12;

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function todayStr() {
  return dateStr(new Date());
}

function last7Dates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(dateStr(d));
  }
  return dates;
}

function sortGoals(list) {
  return [...list].sort(
    (a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name)
  );
}

// Supabase returns at most 1000 rows per request, so page through the history.
async function fetchCheckins(startStr, endStr) {
  let all = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date')
      .order('id')
      .range(from, from + size - 1);
    if (error || !data) break;
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }
  return all;
}

function Chevron({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14171c" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

function Check({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export default function Home() {
  const [tab, setTab] = useState('today');
  const [users, setUsers] = useState([]);
  const [goals, setGoals] = useState([]);
  const [allUserGoals, setAllUserGoals] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meName, setMeName] = useState(null);
  const [calOffset, setCalOffset] = useState(0); // 0 = this month, -1 = last month, ...
  const [calUserId, setCalUserId] = useState(null); // whose calendar is shown (null = me)
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, 1 = yesterday

  const me = users.find((u) => u.name === meName);
  const userGoals = allUserGoals.filter((ug) => ug.user_id === me?.id);

  async function loadAll(who) {
    setLoading(true);
    const [{ data: u }, { data: g }] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('goals').select('*'),
    ]);
    const goalList = sortGoals(g || []);
    setUsers(u || []);
    setGoals(goalList);

    const { data: ugAll } = await supabase.from('user_goals').select('*');
    let ugList = ugAll || [];

    // make sure the current user has a settings row for every goal
    const myUser = (u || []).find((x) => x.name === who);
    if (myUser) {
      const missing = goalList.filter(
        (goal) => !ugList.some((x) => x.user_id === myUser.id && x.goal_id === goal.id)
      );
      if (missing.length > 0) {
        const inserts = missing.map((goal) => ({
          user_id: myUser.id,
          goal_id: goal.id,
          is_on: true,
          use_group_default: true,
          custom_target: goal.target_days,
        }));
        const { data: created } = await supabase.from('user_goals').insert(inserts).select();
        ugList = [...ugList, ...(created || [])];
      }
    }
    setAllUserGoals(ugList);

    const start = new Date();
    start.setDate(start.getDate() - HISTORY_DAYS);
    setCheckins(await fetchCheckins(dateStr(start), todayStr()));
    setLoading(false);
  }

  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('locktober_me');
    } catch (e) {}
    setMeName(saved);
    loadAll(saved);
  }, []);

  function pickUser(name) {
    try {
      localStorage.setItem('locktober_me', name);
    } catch (e) {}
    setMeName(name);
    setTab('today');
    setCalOffset(0);
    setDayOffset(0);
    setCalUserId(null);
    loadAll(name);
  }

  function switchUser() {
    try {
      localStorage.removeItem('locktober_me');
    } catch (e) {}
    setMeName(null);
  }

  // consecutive days with a check-in, counting back from today
  // (if today isn't done yet, the streak still counts through yesterday)
  function streakFor(userId, goalId) {
    const days = new Set(
      checkins.filter((c) => c.user_id === userId && c.goal_id === goalId).map((c) => c.date)
    );
    const d = new Date();
    if (!days.has(dateStr(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(dateStr(d)) && n < HISTORY_DAYS) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function streakLabel(n) {
    return n >= HISTORY_DAYS ? `${HISTORY_DAYS}+` : `${n}`;
  }

  async function toggleDay(goalId) {
    if (!me) return;
    const date = dateStr(daysAgo(dayOffset));
    const existing = checkins.find(
      (c) => c.user_id === me.id && c.goal_id === goalId && c.date === date
    );
    if (existing) {
      await supabase.from('checkins').delete().eq('id', existing.id);
      setCheckins(checkins.filter((c) => c.id !== existing.id));
    } else {
      const { data } = await supabase
        .from('checkins')
        .insert({ user_id: me.id, goal_id: goalId, date, done: true })
        .select();
      if (data) setCheckins([...checkins, data[0]]);
    }
  }

  async function updateUserGoal(id, patch) {
    await supabase.from('user_goals').update(patch).eq('id', id);
    setAllUserGoals(allUserGoals.map((ug) => (ug.id === id ? { ...ug, ...patch } : ug)));
  }

  // step through months; months older than the preloaded history are fetched on demand
  async function goMonth(delta) {
    const next = calOffset + delta;
    if (next > 0 || next < -MAX_MONTHS_BACK) return;
    setCalOffset(next);
    const base = new Date();
    const first = new Date(base.getFullYear(), base.getMonth() + next, 1);
    const last = new Date(base.getFullYear(), base.getMonth() + next + 1, 0);
    const histStart = new Date();
    histStart.setDate(histStart.getDate() - HISTORY_DAYS);
    if (dateStr(first) < dateStr(histStart)) {
      const fetched = await fetchCheckins(dateStr(first), dateStr(last));
      setCheckins((prev) => [...prev, ...fetched.filter((f) => !prev.some((p) => p.id === f.id))]);
    }
  }

  if (loading) {
    return (
      <main className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.wordmark}>WinterArc</div>
        </div>
        <div className={styles.subline} style={{ marginTop: 24 }}>Loading…</div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.wordmark}>WinterArc</div>
        </div>
        <div className={styles.pageTitle}>Who are you?</div>
        {users.map((u) => (
          <button key={u.id} className={styles.pickBtn} onClick={() => pickUser(u.name)}>
            <span className={styles.pickChip} style={{ background: u.color }} />
            {u.name}
          </button>
        ))}
      </main>
    );
  }

  const myGoals = goals.filter((g) =>
    userGoals.find((ug) => ug.goal_id === g.id && ug.is_on)
  );
  const editDate = dateStr(daysAgo(dayOffset));
  const dates = last7Dates();

  // calendar setup for the month being viewed
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = viewDate.getDay();
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const viewUser = users.find((u) => u.id === calUserId) || me;
  const viewGoals = goals.filter((g) => {
    const row = allUserGoals.find((x) => x.user_id === viewUser.id && x.goal_id === g.id);
    return !row || row.is_on;
  });
  const goalColor = (g) => GOAL_COLORS[goals.findIndex((x) => x.id === g.id) % GOAL_COLORS.length];

  const tabs = [
    ['today', 'Today'],
    ['week', 'Week'],
    ['calendar', 'Calendar'],
    ['settings', 'Goals'],
  ];

  return (
    <main className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.wordmark}>WinterArc</div>
        <button
          className={styles.avatar}
          style={{ background: me.color }}
          onClick={switchUser}
          aria-label={`Signed in as ${me.name}. Tap to switch user.`}
        >
          {me.name.charAt(0)}
        </button>
      </div>

      {tab === 'today' && (
        <div>
          <div className={styles.headline} style={{ color: me.color }}>
            {me.name}
          </div>
          <div className={styles.subline} style={{ marginBottom: 14 }}>
            {daysAgo(dayOffset).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className={styles.dayPick}>
            {[
              ['Yesterday', 1],
              ['Today', 0],
            ].map(([label, offset]) => (
              <button
                key={offset}
                className={`${styles.dayBtn} ${dayOffset === offset ? styles.dayBtnActive : ''}`}
                onClick={() => setDayOffset(offset)}
              >
                {label}
              </button>
            ))}
          </div>
          {myGoals.map((g) => {
            const done = checkins.some(
              (c) => c.user_id === me.id && c.goal_id === g.id && c.date === editDate
            );
            const streak = streakFor(me.id, g.id);
            return (
              <button key={g.id} className={styles.goalBtn} onClick={() => toggleDay(g.id)}>
                <span
                  className={styles.checkBox}
                  style={done ? { background: me.color } : undefined}
                >
                  {done && <Check />}
                </span>
                <span>
                  <span className={styles.goalName} style={{ display: 'block' }}>
                    {g.name}
                  </span>
                  {streak > 0 && (
                    <span className={styles.streak} style={{ display: 'block' }}>
                      {streakLabel(streak)} day streak
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {myGoals.length === 0 && (
            <div className={styles.note}>No active goals. Turn some on in the Goals tab.</div>
          )}
        </div>
      )}

      {tab === 'week' && (
        <div>
          <div className={styles.pageTitle}>This week</div>
          {[...users]
            .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0))
            .map((u) => {
            const userCheckins = checkins.filter((c) => c.user_id === u.id);
            const visibleGoals = goals.filter((g) => {
              const row = allUserGoals.find((x) => x.user_id === u.id && x.goal_id === g.id);
              return !row || row.is_on;
            });
            return (
              <div key={u.id} className={styles.friendCard}>
                <div className={styles.friendName}>
                  <i className={styles.friendChip} style={{ background: u.color }} />
                  {u.name}
                </div>
                {visibleGoals.length === 0 && (
                  <div className={styles.subScore} style={{ marginTop: 8, fontSize: 13 }}>
                    No active goals
                  </div>
                )}
                {visibleGoals.map((g) => {
                  const row = allUserGoals.find((x) => x.user_id === u.id && x.goal_id === g.id);
                  const target = row && !row.use_group_default ? row.custom_target : g.target_days;
                  const week = dates.map((d) =>
                    userCheckins.some((c) => c.goal_id === g.id && c.date === d)
                  );
                  const hits = week.filter(Boolean).length;
                  const pct = Math.min(100, Math.round((hits / target) * 100));
                  const streak = streakFor(u.id, g.id);
                  return (
                    <div key={g.id} className={styles.goalSub}>
                      <div className={styles.goalSubTop}>
                        <span className={styles.goalSubName}>{g.name}</span>
                        <span className={styles.subScore}>
                          {hits}/{target} &middot; {pct}%
                        </span>
                      </div>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{ width: `${pct}%`, background: u.color }}
                        />
                      </div>
                      <div className={styles.weekStrip}>
                        {week.map((done, i) => (
                          <i
                            key={i}
                            className={styles.dayDot}
                            style={{ background: done ? u.color : 'var(--track)' }}
                          />
                        ))}
                        {streak > 0 && (
                          <span className={styles.streakRight}>{streakLabel(streak)}d streak</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'calendar' && (
        <div>
          <div className={styles.viewRow}>
            <span>Viewing</span>
            <select
              className={styles.viewSelect}
              value={viewUser.id}
              onChange={(e) => setCalUserId(e.target.value)}
            >
              {[...users]
                .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === me.id ? `${u.name} (you)` : u.name}
                  </option>
                ))}
            </select>
          </div>
          <div className={styles.calHead}>
            <button
              className={styles.calNav}
              onClick={() => goMonth(-1)}
              disabled={calOffset <= -MAX_MONTHS_BACK}
              aria-label="Previous month"
            >
              <Chevron dir="left" />
            </button>
            <div className={styles.calMonth}>{monthLabel}</div>
            <button
              className={styles.calNav}
              onClick={() => goMonth(1)}
              disabled={calOffset >= 0}
              aria-label="Next month"
            >
              <Chevron dir="right" />
            </button>
          </div>
          <div className={styles.calLegend}>
            {viewGoals.map((g) => (
              <span key={g.id}>
                <i style={{ background: goalColor(g) }} />
                {g.name}
              </span>
            ))}
          </div>
          <div className={styles.calGrid}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className={styles.calDow}>
                {d}
              </div>
            ))}
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const key = dateStr(new Date(year, month, d));
              const isToday = calOffset === 0 && d === now.getDate();
              const future = calOffset === 0 && d > now.getDate();
              return (
                <div
                  key={d}
                  className={`${styles.calCell} ${isToday ? styles.calToday : ''}`}
                  style={isToday ? { borderColor: viewUser.color } : undefined}
                >
                  <div className={styles.calDate}>{d}</div>
                  <div className={styles.calMarks}>
                    {!future &&
                      viewGoals
                        .filter((g) =>
                          checkins.some(
                            (c) => c.user_id === viewUser.id && c.goal_id === g.id && c.date === key
                          )
                        )
                        .map((g) => <i key={g.id} style={{ background: goalColor(g) }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div>
          <div className={styles.pageTitle}>Your goals</div>
          {goals.map((g) => {
            const ug = userGoals.find((x) => x.goal_id === g.id);
            if (!ug) return null;
            const shownTarget = ug.use_group_default ? g.target_days : ug.custom_target;
            return (
              <div key={g.id} className={styles.settingCard}>
                <div className={styles.settingTop}>
                  <div className={styles.goalName}>{g.name}</div>
                  <button
                    className={`${styles.switchTrack} ${ug.is_on ? styles.switchOn : ''}`}
                    onClick={() => updateUserGoal(ug.id, { is_on: !ug.is_on })}
                    aria-label={`Turn ${g.name} ${ug.is_on ? 'off' : 'on'}`}
                  >
                    <i className={styles.knob} />
                  </button>
                </div>
                <div className={`${styles.settingBody} ${!ug.is_on ? styles.disabled : ''}`}>
                  <div className={styles.stepperRow}>
                    <span>Your target</span>
                    <div className={styles.stepper}>
                      <button
                        className={styles.stepBtn}
                        onClick={() =>
                          !ug.use_group_default &&
                          updateUserGoal(ug.id, { custom_target: Math.max(1, ug.custom_target - 1) })
                        }
                      >
                        −
                      </button>
                      <span className={styles.stepperVal}>{shownTarget}/7</span>
                      <button
                        className={styles.stepBtn}
                        onClick={() =>
                          !ug.use_group_default &&
                          updateUserGoal(ug.id, { custom_target: Math.min(7, ug.custom_target + 1) })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <label className={styles.defaultRow}>
                    <input
                      type="checkbox"
                      className={styles.sqCheck}
                      checked={ug.use_group_default}
                      onChange={(e) =>
                        updateUserGoal(ug.id, {
                          use_group_default: e.target.checked,
                          custom_target: g.target_days,
                        })
                      }
                    />
                    Use group default ({g.target_days}/7)
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <nav className={styles.tabbar}>
        <div className={styles.tabbarInner}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

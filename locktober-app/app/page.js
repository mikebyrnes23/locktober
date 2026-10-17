'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './page.module.css';


function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export default function Home() {
  const [tab, setTab] = useState('today');
  const [users, setUsers] = useState([]);
  const [goals, setGoals] = useState([]);
  const [userGoals, setUserGoals] = useState([]); // for ME
  const [checkins, setCheckins] = useState([]); // last 7 days, all users
  const [loading, setLoading] = useState(true);
  const [meName, setMeName] = useState(null);

  const me = users.find((u) => u.name === meName);

  async function loadAll(who) {
    setLoading(true);
    const [{ data: u }, { data: g }] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('goals').select('*'),
    ]);
    setUsers(u || []);
    setGoals(g || []);

    const myUser = (u || []).find((x) => x.name === who);
    if (myUser) {
      const { data: ug } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', myUser.id);
      if (!ug || ug.length === 0) {
        const inserts = (g || []).map((goal) => ({
          user_id: myUser.id,
          goal_id: goal.id,
          is_on: true,
          use_group_default: true,
          custom_target: goal.target_days,
        }));
        const { data: created } = await supabase.from('user_goals').insert(inserts).select();
        setUserGoals(created || []);
      } else {
        setUserGoals(ug);
      }
    }

    const dates = last7Dates();
    const { data: c } = await supabase
      .from('checkins')
      .select('*')
      .gte('date', dates[0])
      .lte('date', dates[6]);
    setCheckins(c || []);
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
    loadAll(name);
  }

  function switchUser() {
    try {
      localStorage.removeItem('locktober_me');
    } catch (e) {}
    setMeName(null);
    setUserGoals([]);
  }

  async function toggleToday(goalId) {
    if (!me) return;
    const today = todayStr();
    const existing = checkins.find(
      (c) => c.user_id === me.id && c.goal_id === goalId && c.date === today
    );
    if (existing) {
      await supabase.from('checkins').delete().eq('id', existing.id);
      setCheckins(checkins.filter((c) => c.id !== existing.id));
    } else {
      const { data } = await supabase
        .from('checkins')
        .insert({ user_id: me.id, goal_id: goalId, date: today, done: true })
        .select();
      if (data) setCheckins([...checkins, data[0]]);
    }
  }

  async function updateUserGoal(id, patch) {
    await supabase.from('user_goals').update(patch).eq('id', id);
    setUserGoals(userGoals.map((ug) => (ug.id === id ? { ...ug, ...patch } : ug)));
  }

  if (loading) {
    return (
      <main className={styles.wrap}>
        <h1 className={styles.h1}>Locktober</h1>
        <div className={styles.tag}>Loading…</div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className={styles.wrap}>
        <h1 className={styles.h1}>Locktober</h1>
        <div className={styles.tag}>Who are you?</div>
        {users.map((u) => (
          <button key={u.id} className={styles.pickBtn} onClick={() => pickUser(u.name)}>
            <span className={styles.pickDot} style={{ background: u.color }} />
            {u.name}
          </button>
        ))}
      </main>
    );
  }

  const myGoals = goals.filter((g) =>
    userGoals.find((ug) => ug.goal_id === g.id && ug.is_on)
  );
  const today = todayStr();
  const dates = last7Dates();

  return (
    <main className={styles.wrap}>
      <h1 className={styles.h1}>Locktober</h1>
      <div className={styles.banner} style={{ background: me.color }}>
        <div className={styles.bannerLabel}>Checking in as</div>
        <div className={styles.bannerName}>{me.name}</div>
        <button className={styles.bannerSwitch} onClick={switchUser}>
          not you?
        </button>
      </div>
      <div className={styles.tag}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long' })} check-in
      </div>

      <div className={styles.tabs}>
        {['today', 'week', 'settings'].map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'today' ? 'Today' : t === 'week' ? 'Week' : 'Goals'}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <div>
          {myGoals.map((g) => {
            const done = checkins.some(
              (c) => c.user_id === me?.id && c.goal_id === g.id && c.date === today
            );
            return (
              <div key={g.id} className={styles.goalRow}>
                <div className={styles.goalName}>{g.name}</div>
                <button
                  className={`${styles.toggle} ${done ? styles.toggleOn : ''}`}
                  style={done ? { background: me.color, borderColor: me.color } : undefined}
                  onClick={() => toggleToday(g.id)}
                >
                  {done ? 'Done' : 'Mark'}
                </button>
              </div>
            );
          })}
          {myGoals.length === 0 && (
            <div className={styles.note}>No active goals — turn some on in the Goals tab.</div>
          )}
        </div>
      )}

      {tab === 'week' && (
        <div>
          {users.map((u) => {
            const userCheckins = checkins.filter((c) => c.user_id === u.id);
            return (
              <div key={u.id} className={styles.friendCard}>
                <div className={styles.friendName}>{u.name}</div>
                {goals.map((g) => {
                  const week = dates.map((d) =>
                    userCheckins.some((c) => c.goal_id === g.id && c.date === d)
                  );
                  const hits = week.filter(Boolean).length;
                  const target = g.target_days;
                  const pct = Math.min(100, Math.round((hits / target) * 100));
                  return (
                    <div key={g.id} className={styles.goalSub}>
                      <div className={styles.goalSubTop}>
                        <span>{g.name}</span>
                        <span className={styles.subScore}>
                          {hits}/{target} · {pct}%
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
                          <div
                            key={i}
                            className={styles.dayDot}
                            style={{ background: done ? u.color : 'var(--line)' }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'settings' && (
        <div>
          {goals.map((g) => {
            const ug = userGoals.find((x) => x.goal_id === g.id);
            if (!ug) return null;
            return (
              <div key={g.id} className={styles.settingCard}>
                <div className={styles.settingTop}>
                  <div className={styles.goalName}>{g.name}</div>
                  <button
                    className={`${styles.switch} ${ug.is_on ? styles.switchOn : ''}`}
                    onClick={() => updateUserGoal(ug.id, { is_on: !ug.is_on })}
                  />
                </div>
                <div className={`${styles.settingBody} ${!ug.is_on ? styles.disabled : ''}`}>
                  <div className={styles.stepperRow}>
                    <span>Target</span>
                    <div className={styles.stepper}>
                      <button
                        onClick={() =>
                          !ug.use_group_default &&
                          updateUserGoal(ug.id, { custom_target: Math.max(1, ug.custom_target - 1) })
                        }
                      >
                        −
                      </button>
                      <span className={styles.stepperVal}>{ug.custom_target}/7</span>
                      <button
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
                      checked={ug.use_group_default}
                      onChange={(e) =>
                        updateUserGoal(ug.id, {
                          use_group_default: e.target.checked,
                          custom_target: e.target.checked ? g.target_days : ug.custom_target,
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

      <div className={styles.note}>Live data — synced with your group&apos;s Supabase database.</div>
    </main>
  );
}

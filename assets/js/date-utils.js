(function () {
  const timeZone = 'Asia/Taipei';

  function parts(date, options) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone,
      ...options
    }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const p = parts(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
    return `${p.year}-${p.month}-${p.day}`;
  }

  function monthKey(value) {
    const key = dateKey(value);
    return key ? key.slice(0, 7) : null;
  }

  function hourKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const p = parts(date, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    return `${p.year}-${p.month}-${p.day} ${p.hour}:00`;
  }

  function nowInputValue() {
    const p = parts(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  window.APP_DATE = Object.freeze({ timeZone, dateKey, todayKey: () => dateKey(new Date()), monthKey, hourKey, nowInputValue });
})();

(function () {
  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function drawTrend(records) {
    const container = document.getElementById('trendChart');
    if (!container) return;
    container.replaceChildren();
    const buckets = new Map();
    records.forEach(record => {
      const key = window.APP_DATE.hourKey(record.聞到的時間);
      const level = Number(record.臭味程度);
      if (!key || !Number.isFinite(level)) return;
      const bucket = buckets.get(key) || { sum: 0, count: 0 };
      bucket.sum += level;
      bucket.count += 1;
      buckets.set(key, bucket);
    });
    const values = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ key, value: value.sum / value.count }));
    if (!values.length) {
      const empty = document.createElement('p');
      empty.className = 'chart-empty';
      empty.textContent = '目前篩選範圍沒有足夠資料可繪圖。';
      container.appendChild(empty);
      return;
    }

    const width = 720;
    const height = 220;
    const padding = { top: 20, right: 18, bottom: 42, left: 42 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '臭味程度時間趨勢圖');
    const y = value => padding.top + innerHeight - (value / 5) * innerHeight;
    const x = index => values.length === 1 ? padding.left + innerWidth / 2 : padding.left + (index / (values.length - 1)) * innerWidth;
    [0, 1, 2, 3, 4, 5].forEach(level => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padding.left); line.setAttribute('x2', width - padding.right);
      line.setAttribute('y1', y(level)); line.setAttribute('y2', y(level));
      line.setAttribute('class', 'chart-gridline');
      svg.appendChild(line);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', padding.left - 10); label.setAttribute('y', y(level) + 4);
      label.setAttribute('text-anchor', 'end'); label.setAttribute('class', 'chart-label');
      label.textContent = String(level); svg.appendChild(label);
    });
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', values.map((item, index) => `${x(index)},${y(item.value)}`).join(' '));
    polyline.setAttribute('class', 'chart-line');
    svg.appendChild(polyline);
    values.forEach((item, index) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x(index)); circle.setAttribute('cy', y(item.value)); circle.setAttribute('r', '4');
      circle.setAttribute('class', 'chart-point');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${item.key}：${item.value.toFixed(1)} 級`;
      circle.appendChild(title); svg.appendChild(circle);
    });
    const first = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    first.setAttribute('x', padding.left); first.setAttribute('y', height - 12); first.setAttribute('class', 'chart-label');
    first.textContent = values[0].key.slice(-5); svg.appendChild(first);
    const last = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    last.setAttribute('x', width - padding.right); last.setAttribute('y', height - 12); last.setAttribute('text-anchor', 'end'); last.setAttribute('class', 'chart-label');
    last.textContent = values[values.length - 1].key.slice(-5); svg.appendChild(last);
    container.appendChild(svg);
  }

  window.renderAnalysisSummary = function (records) {
    const valid = records.filter(record => Number.isFinite(Number(record.臭味程度)));
    const average = valid.length ? valid.reduce((sum, record) => sum + Number(record.臭味程度), 0) / valid.length : null;
    const peak = valid.reduce((best, record) => !best || Number(record.臭味程度) > Number(best.臭味程度) ? record : best, null);
    const peakTime = peak ? new Date(peak.聞到的時間).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }) : '--';
    setText('recordCount', String(valid.length));
    setText('averageLevel', average === null ? '--' : average.toFixed(1));
    setText('peakLevel', peak ? `${peak.臭味程度} 級` : '--');
    setText('peakTime', peak ? peakTime : '--');
    setText('summaryText', valid.length ? `目前顯示 ${valid.length} 筆紀錄；趨勢圖以台灣時間每小時平均臭味程度呈現。` : '請調整日期或最低臭味程度篩選條件。');
    drawTrend(valid);
  };
})();

(function () {
  window.submitRecord = async function (payload) {
    const config = window.APP_CONFIG || {};
    if (!config.recordEndpoint) throw new Error('Record endpoint is not configured');
    const controller = new AbortController();
    const timeoutMs = config.officialSubmissionTimeoutMs || Math.max(config.requestTimeoutMs || 15000, 60000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(config.recordEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        mode: config.recordMode || 'no-cors',
        signal: controller.signal
      });
      return {
        responseType: response.type,
        confirmed: response.type !== 'opaque' && response.ok === true
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  window.submitOfficialComplaint = async function (packet) {
    const config = window.APP_CONFIG || {};
    if (!config.officialSubmissionEndpoint) {
      return { status: 'not_configured' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 15000);
    try {
      const response = await fetch(config.officialSubmissionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...packet, mode: config.officialSubmissionMode || 'prepare' }),
        mode: 'cors',
        signal: controller.signal
      });
      let body = {};
      try { body = await response.json(); } catch (error) { /* Keep the transport error below. */ }
      if (!response.ok) {
        const error = new Error(body.message || `Official submission service returned ${response.status}`);
        error.code = body.code || 'OFFICIAL_SUBMISSION_FAILED';
        error.status = response.status;
        throw error;
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  };
})();

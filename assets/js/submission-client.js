(function () {
  async function postOfficial(endpoint, payload) {
    const config = window.APP_CONFIG || {};
    if (!endpoint) return { status: 'not_configured' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.officialSubmissionTimeoutMs || 60000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        signal: controller.signal
      });
      let body = {};
      try { body = await response.json(); } catch (error) { /* Keep the transport error below. */ }
      if (!response.ok) {
        const requestError = new Error(body.message || `Official submission service returned ${response.status}`);
        requestError.code = body.code || 'OFFICIAL_SUBMISSION_FAILED';
        requestError.status = response.status;
        requestError.result = body;
        throw requestError;
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

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

  window.updateOfficialSubmissionStatus = async function (recordId, status) {
    const config = window.APP_CONFIG || {};
    if (!config.recordEndpoint) throw new Error('Record endpoint is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 15000);
    try {
      const response = await fetch(config.recordEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ action: 'official-submission-status', recordId, status }),
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
    return postOfficial(config.officialSubmissionEndpoint, { ...packet, mode: packet.mode || config.officialSubmissionMode || 'prepare' });
  };

  window.prepareOfficialComplaint = async function (packet) {
    const config = window.APP_CONFIG || {};
    return postOfficial(config.officialPrepareEndpoint, {
      ...packet,
      mode: 'prepare',
      finalSubmit: false,
      confirmationText: ''
    });
  };

  window.finalizeOfficialComplaint = async function (sessionId, captchaText) {
    const config = window.APP_CONFIG || {};
    return postOfficial(config.officialFinalizeEndpoint, {
      sessionId,
      captchaText,
      confirmationText: config.officialFinalConfirmationText || ''
    });
  };
})();

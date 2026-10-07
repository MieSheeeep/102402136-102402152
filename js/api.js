(function () {
  'use strict';
  let csrf = '';
  async function request(method, path, body) {
    const headers = {};
    const multipart = body instanceof FormData;
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = csrf;
    let response, result;
    try { response = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) }); }
    catch (_) { throw new Error('无法连接服务，请确认后端运行后重试'); }
    try { result = await response.json(); } catch (_) { throw new Error('服务响应异常，请稍后重试'); }
    if (!response.ok) { const error = new Error(result.message || '操作未完成'); error.status = response.status; error.fields = result.fields; throw error; }
    if (result.csrf !== undefined) csrf = result.csrf;
    return result;
  }
  async function upload(file) { const body = new FormData(); body.append('file', file); return (await request('POST', '/uploads', body)).url; }
  window.CampusAPI = { request, upload };
})();

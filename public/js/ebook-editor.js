document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('onlyoffice-editor');
  if (!container) return;
  if (!window.DocsAPI) {
    container.textContent = 'The spreadsheet editor could not load. Check the ONLYOFFICE Docs URL and try again.';
    return;
  }
  try {
    const config = JSON.parse(container.dataset.editorConfig);
    new window.DocsAPI.DocEditor(container.id, config);
  } catch (error) {
    console.error('Unable to start spreadsheet editor:', error);
    container.textContent = 'The spreadsheet editor could not start. Refresh the page or contact an administrator.';
  }
});

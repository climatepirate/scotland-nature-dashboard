export function createPlaceholderPage(title, message) {
  const page = document.createElement("section");
  page.className = "placeholder-page panel";

  const head = document.createElement("div");
  head.className = "panel-head";

  const titleElement = document.createElement("h2");
  titleElement.className = "panel-title";
  titleElement.textContent = title;

  head.append(titleElement);

  const body = document.createElement("div");
  body.className = "placeholder-page-body";

  const messageElement = document.createElement("p");
  messageElement.className = "placeholder-page-message";
  messageElement.textContent = message;

  body.append(messageElement);
  page.append(head, body);

  return page;
}

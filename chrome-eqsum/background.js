// The toolbar button and the right-click menu open the viewer on a PDF: the page you're on, or a
// link to one. The viewer asks for access to that site only when it needs it.
const open = (src) => chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") + (src ? "?src=" + encodeURIComponent(src) : "") });

chrome.action.onClicked.addListener((tab) => open(tab.url && /^(https?|file):/.test(tab.url) ? tab.url : ""));

chrome.runtime.onInstalled.addListener(() => {
  // only on what looks like a PDF: a .pdf link or page, or arXiv's PDFs (whose links have no .pdf);
  // the toolbar button works on any page
  const pdfs = ["*://*/*.pdf", "*://*/*.pdf?*", "*://*/*.pdf#*", "*://*/*.PDF", "*://arxiv.org/pdf/*", "file:///*.pdf"];
  chrome.contextMenus.create({ id: "link", title: "Summarise this PDF", contexts: ["link"], targetUrlPatterns: pdfs });
  chrome.contextMenus.create({ id: "page", title: "Summarise this PDF", contexts: ["page"], documentUrlPatterns: pdfs });
});

chrome.contextMenus.onClicked.addListener((info, tab) => open(info.menuItemId === "link" ? info.linkUrl : info.pageUrl ?? tab?.url));

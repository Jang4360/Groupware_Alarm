// The groupware may complete login inside a frame without navigating its outer tab.
chrome.runtime.sendMessage({ target: 'background', type: 'groupware-loaded' }).catch(() => {});

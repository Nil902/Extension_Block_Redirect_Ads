# Video Ad & Redirect Blocker

Version 1.3.0 is a private, local Chrome/Chromium extension. It is **not published to any extension store**, and publishing is not required for desktop use.

The extension automatically:

- Blocks popup and pop-under tabs.
- Blocks cross-site advertising redirects.
- Hides common banners, overlays, sponsored boxes, and advertising frames.
- Blocks requests to common advertising services.
- Clicks recognized **Skip Ad** controls.
- Fast-forwards video segments when a player clearly identifies them as advertisements.

Protection, webpage-ad blocking, and video-ad skipping start automatically on every new website.

## Supported installations

| Platform | Local installation | Status |
| --- | --- | --- |
| Chrome, Edge, Brave, or Chromium on Windows/macOS/Linux | Load the unpacked folder | Supported and recommended |
| Google Chrome on Android | Not available | Mobile Chrome cannot install extensions |
| Kiwi Browser on Android | ZIP sideloading | Experimental; Kiwi is archived and unsupported |
| Chrome on iPhone/iPad | Not available | iOS Chrome cannot install Chrome extensions |
| Safari on iPhone/iPad | Requires a separate Safari Web Extension app | The current ZIP cannot be installed directly |

## Install on this Mac

1. Open Google Chrome.
2. Enter `chrome://extensions` in the address bar.
3. Turn on **Developer mode** in the upper-right corner.
4. Select **Load unpacked**.
5. Select this folder:

   `/Users/nil/Documents/Extension`

6. Open Chrome's Extensions menu and pin **Video Ad & Redirect Blocker** if you want quick access to its controls.
7. Refresh any webpages that were already open when the extension was installed.

Chrome documents the same local installation process in its [Load an unpacked extension guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Install on another Windows, Mac, or Linux computer

Publishing is not required. Copy the extension privately to the other computer:

1. Copy the complete `Extension` folder to the other computer. You may ZIP it for transfer.
2. If you transferred a ZIP, extract it to a permanent folder first.
3. Confirm that `manifest.json`, `content.js`, and `service-worker.js` are directly inside the extracted folder.
4. Open the browser's extensions page:

   - Chrome, Brave, or Chromium: `chrome://extensions`
   - Microsoft Edge: `edge://extensions`

5. Turn on **Developer mode**.
6. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
7. Refresh existing webpages.

Microsoft also documents [local extension sideloading in Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading).

Do not delete or move the unpacked folder after installation. The browser continues to load the extension from that location.

## Use the extension

No setup is required on each new website. Protection is active automatically.

1. Open the video webpage.
2. Try playing the video normally.
3. The extension will automatically remove recognized page ads, stop external advertising redirects, and skip recognized video advertisements.
4. A small message appears when the extension blocks a redirect or skips an advertisement.

Click the extension icon to adjust the current website:

- **Protection on this site:** Turns all protection on or off for only the current website. New websites remain protected automatically.
- **Hide webpage ads:** Controls network filtering and removal of banners, overlays, sponsored boxes, and advertising frames.
- **Skip video ads:** Controls automatic Skip Ad clicks and recognized advertisement fast-forwarding.
- **Allowed destinations:** Add a trusted external domain when a legitimate sign-in, payment, download, or account page is being blocked.

For example, enter `accounts.example.com` rather than a complete URL. Remove it from the list when it is no longer needed.

## Use in Incognito mode on desktop

Chrome disables extensions in Incognito by default:

1. Open `chrome://extensions`.
2. Find **Video Ad & Redirect Blocker** and select **Details**.
3. Turn on **Allow in Incognito**.
4. Close and reopen the Incognito window.

Google provides the same setting under [Manage your extensions](https://support.google.com/chrome/answer/2664769).

## Update the local extension

When files in the `Extension` folder are changed:

1. Open `chrome://extensions` or `edge://extensions`.
2. Find **Video Ad & Redirect Blocker**.
3. Select **Reload**.
4. Refresh or reopen the webpages where you want the updated code to run.
5. Close and reopen Incognito windows if you use the extension there.

If another person receives an updated ZIP, they should replace their old extracted files, select **Reload**, and refresh their webpages.

## Android phones and tablets

### Google Chrome for Android

The extension cannot be installed in Google Chrome for Android, whether it is a folder, ZIP, or CRX file. On Android, Chrome's **Add to Desktop** command sends an extension to desktop Chrome; it does not install it on the phone. See [Google Chrome Help](https://support.google.com/chrome/answer/2664769).

### Experimental local installation with Kiwi Browser

Kiwi Browser historically allowed Chrome extensions to be installed from local ZIP files. However, its developers [archived Kiwi in January 2025](https://github.com/kiwibrowser/src.next/blob/kiwi/README.md), so it no longer receives normal maintenance or security updates. This option is experimental, may not support every Manifest V3 API used by this extension, and is **not recommended for sensitive browsing, banking, or account logins**.

If you accept those limitations:

1. On the computer, create a ZIP containing the extension files.
2. Open the ZIP and confirm `manifest.json` is at the top level—not inside an extra nested folder.
3. Transfer the ZIP to the Android device.
4. Install Kiwi only from its official archived project or another source you independently trust. Avoid unofficial clones.
5. In Kiwi, open the menu and select **Extensions**.
6. Turn on **Developer mode**.
7. Select **+ (from .zip/.crx/.user.js)** or the similarly named local-install option.
8. Select the transferred ZIP and approve its permissions.
9. Open a video webpage and refresh it once.
10. Open the extension's popup, if available, and confirm that protection is active.

If Kiwi rejects the manifest, does not show the popup, or does not block requests, its extension engine is incompatible with this version. A ZIP change alone cannot correct missing browser APIs.

Current Microsoft Edge Canary for Android can install some extensions by store ID, but that workflow still requires the extension to exist in a compatible store and therefore does not solve private, unpublished ZIP installation.

## iPhone and iPad

The current extension folder or ZIP cannot be installed in Chrome on iPhone or iPad.

Apple supports extensions through Safari Web Extensions packaged as iOS applications. Using this project on iPhone or iPad would require:

1. Converting the Chrome extension into a Safari Web Extension project.
2. Reviewing and replacing Chrome APIs that Safari does not support.
3. Building and signing the containing iOS application with Xcode.
4. Installing that signed application on the device and enabling its Safari extension.

This can be tested privately from Xcode without publishing the Chrome version, but it is a separate mobile build—the existing ZIP is not sufficient. See Apple's [Safari extensions overview](https://developer.apple.com/safari/extensions/) and [Safari Web Extension creation guide](https://developer.apple.com/documentation/safariservices/creating-a-safari-web-extension).

## Troubleshooting

### Nothing is being blocked

1. Open `chrome://extensions` and confirm the extension is enabled.
2. Select **Reload** on the extension card.
3. Refresh or reopen the video webpage.
4. Open the extension and confirm:

   - **Protection on this site** is active.
   - **Hide webpage ads** is selected.
   - **Skip video ads** is selected.

5. If using Incognito, confirm **Allow in Incognito** is enabled.

### A legitimate page is blocked

Add its domain under **Allowed destinations**, or temporarily turn off protection for the current website.

### A particular advertisement is not blocked

Some websites use random element names, first-party advertising servers, or custom video players. The extension may need a rule written specifically for that website. Record the webpage URL and describe whether the remaining advertisement is a banner, popup, overlay, or video advertisement.

### The video advertisement is part of the video

An advertisement may be stitched into the same media stream as the requested video. In that case, the browser sees one continuous video and cannot reliably remove the advertisement without also damaging or skipping the requested content.

## Privacy and limitations

- The extension runs locally and does not send browsing data to an external server.
- It needs access to webpages and tabs so it can identify and stop advertisements, popups, and redirects.
- It does not bypass subscriptions, paywalls, DRM, logins, or access controls.
- Locally installed extensions must be updated manually by replacing the files and selecting **Reload**.
- Only install this extension from a copy you trust. A browser extension with access to webpages has powerful permissions.

package io.aikido.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Offline shell around the bundled docs site plus the mobile daily-capture page.
 *
 * Everything is served from file:///android_asset/site/; http(s) links open in
 * the system browser. The page talks to Android through {@link Bridge} to save
 * (Storage Access Framework) or share a rendered daily log.
 */
public class MainActivity extends Activity {

    private static final String SITE = "file:///android_asset/site/";
    private static final int REQ_SAVE = 1;

    private WebView web;
    private String pendingText;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // drafts + theme choice live in localStorage
        s.setAllowFileAccess(true);

        web.addJavascriptInterface(new Bridge(), "AikidoAndroid");
        web.setWebViewClient(new WebViewClient() {
            // The (WebView, String) overload is the only one in the API 23 SDK;
            // newer WebViews route the request-based overload through it by default.
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternally(Uri.parse(url));
            }
        });

        if (state != null) {
            pendingText = state.getString("pendingText");
            web.restoreState(state);
        } else {
            web.loadUrl(SITE + "daily.html");
        }
    }

    private boolean openExternally(Uri uri) {
        String scheme = uri.getScheme();
        if ("file".equals(scheme)) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("No app can open " + uri);
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putString("pendingText", pendingText); // survives process death while the picker is open
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SAVE) {
            return;
        }
        String text = pendingText;
        pendingText = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) {
            return;
        }
        try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            toast("Saved");
        } catch (Exception e) {
            toast("Save failed: " + e.getMessage());
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    /** Methods exposed to page JavaScript as {@code window.AikidoAndroid}. */
    private final class Bridge {

        @JavascriptInterface
        public void save(final String filename, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingText = text;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("text/markdown");
                    i.putExtra(Intent.EXTRA_TITLE, filename);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        pendingText = null;
                        toast("No file picker available");
                    }
                }
            });
        }

        @JavascriptInterface
        public void share(final String filename, final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_SUBJECT, filename);
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "Share " + filename));
                }
            });
        }
    }
}

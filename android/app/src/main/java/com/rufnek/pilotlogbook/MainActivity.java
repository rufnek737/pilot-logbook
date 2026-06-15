package com.rufnek.pilotlogbook;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new PrintBridge(this, webView), "AndroidPrint");
    }

    static class PrintBridge {
        private final Context context;
        private final WebView webView;

        PrintBridge(Context context, WebView webView) {
            this.context = context;
            this.webView = webView;
        }

        @JavascriptInterface
        public void print() {
            ((android.app.Activity) context).runOnUiThread(() -> {
                PrintManager pm = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
                pm.print("Pilot Logbook", webView.createPrintDocumentAdapter("Pilot Logbook"), null);
            });
        }
    }
}

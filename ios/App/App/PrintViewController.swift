import UIKit
import WebKit
import Capacitor

class PrintViewController: CAPBridgeViewController, WKScriptMessageHandler {

    override func capacitorDidLoad() {
        webView?.configuration.userContentController.add(self, name: "iosPrint")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "iosPrint", let webView = webView else { return }

        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.outputType = .general
        printInfo.jobName = "Pilot Logbook"

        let printController = UIPrintInteractionController.shared
        printController.printInfo = printInfo
        // JS가 인쇄용 HTML을 넘기면 그걸 직접 렌더한다(viewPrintFormatter는 position:fixed
        // 오버레이를 백지로 렌더하는 문제가 있어 UIMarkupTextPrintFormatter가 안정적).
        if let html = message.body as? String, !html.isEmpty, html != "print" {
            let fmt = UIMarkupTextPrintFormatter(markupText: html)
            fmt.perPageContentInsets = UIEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
            printController.printFormatter = fmt
        } else {
            printController.printFormatter = webView.viewPrintFormatter()
        }
        printController.present(animated: true, completionHandler: nil)
    }
}

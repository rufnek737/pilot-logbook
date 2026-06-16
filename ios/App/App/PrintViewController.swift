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
        printController.printFormatter = webView.viewPrintFormatter()
        printController.present(animated: true, completionHandler: nil)
    }
}

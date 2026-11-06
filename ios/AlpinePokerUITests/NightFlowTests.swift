import XCTest

/// Plays one league night from start to settlement, the way the table does.
final class NightFlowTests: XCTestCase {
    @MainActor
    func testSeatDealCountAndSettle() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-uiTestFreshStart", "YES"]
        app.launch()

        app.buttons["Set up the table"].tap()
        XCTAssertTrue(app.staticTexts["Seat the table"].waitForExistence(timeout: 3))
        app.buttons["Seat Raj, Big daddy"].tap()
        app.buttons["Seat KG, F*** it!!"].tap()
        save(app, "1-seating")

        app.buttons["Deal the cards"].tap()
        XCTAssertTrue(app.buttons["Cash out"].firstMatch.waitForExistence(timeout: 3))
        app.buttons["Rebuy"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Rebuy"].waitForExistence(timeout: 2))
        app.buttons["Add rebuy"].tap()
        save(app, "2-table")

        app.buttons["Cash out"].firstMatch.tap()
        app.buttons["Start counting"].tap()
        XCTAssertTrue(app.staticTexts["Count the chips"].waitForExistence(timeout: 3))
        // Raj bought in 1500 and rebought 1500; KG bought in 1500: 4500 in play
        enter(app, "Raj's chips", "1000")
        enter(app, "KG's chips", "3500")
        save(app, "3-cash-out")
        app.buttons["Settle up"].tap()

        XCTAssertTrue(app.staticTexts["Who pays whom"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Raj pays KG ₹2,000"].exists)
        save(app, "4-settlement")
        app.buttons["Raj pays KG ₹2,000"].tap()
        XCTAssertTrue(app.staticTexts["All squared up"].waitForExistence(timeout: 2))
    }

    @MainActor
    private func enter(_ app: XCUIApplication, _ field: String, _ text: String) {
        let input = app.textFields[field]
        input.tap()
        input.typeText(text)
        app.toolbars.buttons["Done"].firstMatch.tap()
    }

    /// Screenshots land in the test report, and in POKER_SHOTS on the Mac when set.
    @MainActor
    private func save(_ app: XCUIApplication, _ name: String) {
        let shot = app.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["POKER_SHOTS"] {
            try? shot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}

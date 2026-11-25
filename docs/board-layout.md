# Board layout behavior

The board shell keeps product navigation outside the Excalidraw document. Panel
visibility and participant presentation are transient browser UI; they are not
canvas elements and are never sent over the board connection.

```gherkin
Feature: Responsive board shell

  Scenario: Toggle the component panel without resetting the editor
    Given a board has a scene, selection, and viewport
    When the component panel is opened or closed
    Then the same editor instance keeps its scene, selection, and viewport

  Scenario: Dismiss a panel with the keyboard
    Given keyboard focus is inside the component panel
    When the user presses Escape
    Then the panel closes
    And focus returns to the component-panel button in the top bar

  Scenario: Use the board on a narrow screen
    Given the viewport is 390 pixels wide
    When the component panel is open
    Then the panel is dismissible
    And the drawing toolbar above it remains reachable
    And the zoom controls below it remain reachable

  Scenario: Read live connection state
    Given the board is connecting, connected, or reconnecting
    When its connection state changes
    Then the truthful state is announced without moving keyboard focus
    And it is never described as Saved
```

The top bar renders the approved Chalkline logo, the real board identifier from
the URL, a horizontal row of up to two participant avatars, and live connection
state. Further participants are summarized as `+N`. Share, Export, and theme
slots stay empty until those actions have working behavior.

# Floating board toolbar

The toolbar replaces Excalidraw's tool picker with a movable Chalkline control.
Excalidraw still owns the active tool. The toolbar position is transient UI
state stored in `sessionStorage`, so it never enters the shared board document.

Excalidraw 0.18.1 has no toolbar-replacement API. Its version-specific selectors
are isolated in `frontend/src/toolbar/excalidrawAdapter.css`; recheck them when
upgrading Excalidraw.

## Acceptance scenarios

```gherkin
Feature: Floating board toolbar

  Scenario: Selecting a tool by button
    Given I am on a board
    When I click the Rectangle button
    Then the rectangle tool is active
    And only the Rectangle button is highlighted
    And Excalidraw's keyboard shortcuts still work

  Scenario: Selecting a tool by shortcut
    Given the canvas has focus
    When I press "A"
    Then the arrow tool is active
    And only the Arrow button is highlighted

  Scenario: Using a shortcut right after the name prompt
    Given the name prompt is open
    When I join the board or continue as a guest
    And I press "A"
    Then the arrow tool is active

  Scenario: Using a shortcut as a returning visitor
    Given my display name is already saved
    When I open a board
    And I press "A" without clicking the canvas
    Then the arrow tool is active

  Scenario: Using a tool that is not on the toolbar
    Given the canvas has focus
    When I press "D"
    Then the diamond tool is active
    And no toolbar tool is highlighted

  Scenario: Drawing an arrow with two clicks
    Given the arrow tool is active
    When I click the start point and then the end point
    Then the arrow is finished
    And it no longer follows my pointer

  Scenario Outline: Switching tools during an unfinished arrow
    Given I have placed only the start of an arrow
    When I switch to Select using <input>
    Then the unfinished arrow is removed or finished
    And the select tool is active

    Examples:
      | input              |
      | the "V" shortcut   |
      | the toolbar button |

  Scenario: Finding the move handle
    When I look at the toolbar
    Then a thin move handle sits between Components and Reset position

  Scenario: Dragging the toolbar
    Given a board with existing shapes
    When I drag the toolbar by its handle
    Then it collapses to show only the selected tool
    And it follows my pointer within the canvas
    And the board does not change
    And collaborators' toolbars do not move

  Scenario: Tool buttons cannot drag the toolbar
    When I press and drag from a tool button
    Then the toolbar stays where it is

  Scenario Outline: Attaching to a canvas edge
    Given I am dragging the collapsed toolbar
    When I release it nearest the <edge> edge
    Then it expands attached to that edge
    And it is <orientation>

    Examples:
      | edge   | orientation |
      | left   | vertical    |
      | right  | vertical    |
      | top    | horizontal  |
      | bottom | horizontal  |

  Scenario: Moving the toolbar by keyboard
    Given the toolbar handle has focus
    When I press an arrow key
    Then the toolbar moves in that direction
    And selected shapes do not move

  Scenario: Pivoting by keyboard
    Given the vertical toolbar touches the bottom edge
    And its handle has focus
    When I press the down arrow
    Then the toolbar docks to the bottom edge as a horizontal bar

  Scenario: Cancelling a move
    Given I am moving the toolbar
    When I press Escape
    Then the toolbar returns to where the move began
    And it returns to its earlier orientation

  Scenario: Resetting the toolbar
    Given I have moved the toolbar
    When I activate Reset toolbar position
    Then the toolbar returns to its default vertical position
    And its saved position is cleared

  Scenario: The canvas gets smaller and larger again
    Given I have moved the toolbar near the right edge
    When the window or a panel makes the canvas narrower
    Then the toolbar stays inside the canvas
    When the canvas regains its width
    Then the toolbar returns to my chosen position

  Scenario: The canvas is too short for one column
    When the canvas is shorter than the toolbar
    Then the controls wrap into another column
    And every control remains on screen
```

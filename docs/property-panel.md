# Property panel

The property panel edits one component's name and catalog settings. It opens
in the board layout's right panel when exactly one valid component is selected.
Inputs are built from `CATALOG`, so a new kind or setting needs no panel code.

Changes are validated with `updateComponent` before they reach the scene, and
scene sync sends them to other clients. Drafts and errors are transient UI
state in the panel; only saved values enter the shared board document.

## Concurrent edits

A save writes only the fields it changes, on top of the latest version of the
component. Someone else's edit to a different field is kept, and an input you
are typing in keeps its draft and focus when another field changes. When
someone else changes the field you are typing in, their saved value replaces
your draft. There is no conflict warning; the last save of a field wins.

## Acceptance scenarios

```gherkin
Feature: Component property panel

  Scenario: Opening the panel
    Given a board with a database component
    When I select only that component
    Then the panel shows its name, engine and replicas

  Scenario: Saving a setting
    Given the panel is open for a database
    When I change Replicas to 3 and press Enter
    Then the component's replicas are 3 for everyone on the board

  Scenario: Rejecting an invalid value
    Given the panel is open for a database
    When I change Replicas to 0 and leave the box
    Then "must be at least 1" is shown under Replicas
    And the component's replicas are unchanged

  Scenario: Putting back the saved value
    Given "must be at least 1" is shown under Replicas
    When I type the saved value back and leave the box
    Then the error is gone

  Scenario: Saving another field while one is invalid
    Given "must be at least 1" is shown under Replicas
    When I change Engine to MySQL
    Then Engine is saved
    And Replicas still shows my rejected value and its error

  Scenario: Someone else edits a different field while I type
    Given I have typed 5 in Replicas without saving
    When another user changes Engine to MySQL
    Then Engine shows MySQL
    And Replicas still shows 5 and keeps focus
    When I leave the Replicas box
    Then the component has engine MySQL and replicas 5

  Scenario: Someone else edits the field I am typing in
    Given I have typed 5 in Replicas without saving
    When another user changes Replicas to 4
    Then Replicas shows 4

  Scenario: Someone else fixes a field that shows an error
    Given "must be at least 1" is shown under Replicas
    When another user changes Replicas to 4
    Then Replicas shows 4 with no error

  Scenario: Selecting another component
    Given I have typed in the panel without saving
    When I select a different component
    Then the panel shows that component's saved values with no errors
```

## Where the scenarios are tested

| Scenario | Automated in |
| --- | --- |
| Opening the panel | `selectedComponent.test.ts`, `PropertyPanel.test.tsx` |
| Saving a setting | `useComponentPanel.test.ts`; across two windows, manual |
| Rejecting an invalid value | `useComponentPanel.test.ts`, `PropertyPanel.test.tsx` |
| Putting back the saved value | `SettingInput.test.tsx`, `useComponentPanel.test.ts` |
| Saving another field while one is invalid | `useComponentPanel.test.ts` |
| Someone else edits a different field | `PropertyPanel.test.tsx`, `useComponentPanel.test.ts` |
| Someone else edits the field I am typing in | `PropertyPanel.test.tsx` |
| Someone else fixes a field that shows an error | `useComponentPanel.test.ts` |
| Selecting another component | `PropertyPanel.test.tsx`, `useComponentPanel.test.ts` |

The two-window run (one browser window per user) is still a manual check.

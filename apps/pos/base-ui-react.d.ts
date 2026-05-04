/* eslint-disable @typescript-eslint/no-explicit-any -- @base-ui/react has no published .d.ts in this install */
declare module "@base-ui/react" {
  type ComboboxProps = any;

  type ComboboxPart = import("react").ComponentType<ComboboxProps> & {
    Props: ComboboxProps;
  };

  export const Combobox: {
    Root: ComboboxPart;
    Value: ComboboxPart;
    Trigger: ComboboxPart;
    Clear: ComboboxPart;
    Input: ComboboxPart;
    Portal: ComboboxPart;
    Positioner: ComboboxPart;
    Popup: ComboboxPart;
    List: ComboboxPart;
    Item: ComboboxPart;
    ItemIndicator: ComboboxPart;
    Group: ComboboxPart;
    GroupLabel: ComboboxPart;
    Collection: ComboboxPart;
    Empty: ComboboxPart;
    Separator: ComboboxPart;
    Chips: ComboboxPart;
    Chip: ComboboxPart;
    ChipRemove: ComboboxPart;
  };
}

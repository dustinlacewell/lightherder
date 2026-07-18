# @ldlework/phosphor-dials

Phosphor-styled component set for [`@ldlework/dials`](../dials)' `Panel`.

```tsx
import '@ldlework/phosphor/styles.css'
import { Panel } from '@ldlework/dials/react'
import { dialPanelComponents } from '@ldlework/phosphor-dials'

<Panel dials={mySurface} components={dialPanelComponents} />
```

The bundle conforms `@ldlework/phosphor`'s primitives (`Slider`,
`NumberField`, `Dropdown`, `HelpTooltip`) to dials' `PanelComponents`
contract, and adds a skeuomorphic `Row` + `Heading` layout that suits
the chrome aesthetic.

No new design tokens; uses phosphor's existing token surface. To
customise individual parts, pass your own component(s) for any slot:

```tsx
<Panel
  dials={mySurface}
  components={{ ...dialPanelComponents, Slider: MyCustomSlider }}
/>
```


/*
  Bird Money Component
  --------------------
  This custom element uses Shadow DOM. Its internal layout is completely
  isolated from the RTL direction and CSS of the rest of the application.
  Visual order is always:
      NUMBER   ر.س
*/

function formatAmount(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

class BirdMoney extends HTMLElement {
  static get observedAttributes() { return ["value"]; }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  render() {
    const value = this.getAttribute("value") ?? "0";
    const formatted = formatAmount(value);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
          direction: ltr !important;
          unicode-bidi: isolate !important;
          white-space: nowrap;
          vertical-align: baseline;
        }
        .money {
          display: inline-flex;
          flex-direction: row;
          direction: ltr;
          align-items: baseline;
          justify-content: flex-start;
          gap: 5px;
          white-space: nowrap;
        }
        .num {
          display: inline-block;
          direction: ltr;
          unicode-bidi: isolate;
          order: 1;
        }
        .currency {
          display: inline-block;
          direction: rtl;
          unicode-bidi: isolate;
          order: 2;
        }
      </style>
      <span class="money" dir="ltr">
        <span class="num" dir="ltr">${formatted}</span>
        <span class="currency" dir="rtl">ر.س</span>
      </span>
    `;
  }
}

if (!customElements.get("bird-money")) {
  customElements.define("bird-money", BirdMoney);
}

export function setMoney(target, value) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return;
  const money = document.createElement("bird-money");
  money.setAttribute("value", String(Number(value || 0)));
  el.replaceChildren(money);
}

export function moneyMarkup(value) {
  const safe = Number(value || 0);
  return `<bird-money value="${safe}"></bird-money>`;
}

export function moneyText(value) {
  return `${formatAmount(value)} ر.س`;
}

export { formatAmount };

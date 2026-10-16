const rulesContainer = document.getElementById("rulesContainer");
const btnAddRule = document.getElementById("btnAddRule");
const testInput1 = document.getElementById("test1");
const testInput2 = document.getElementById("test2");

// lê todas as regras e suas alternativas a partir do DOM
function getRulesFromDOM() {
  const rows = rulesContainer.querySelectorAll(".rule-row");
  const rules = [];

  rows.forEach((row) => {
    const leftInput = row.querySelector(".rule-left");
    const altInputs = row.querySelectorAll(".alt-input");

    const left = leftInput ? leftInput.value.trim().toUpperCase() : "";
    const alternatives = [];

    altInputs.forEach((input) => {
      alternatives.push(input.value.trim());
    });

    if (left.length > 0) {
      rules.push({ left, alternatives });
    }
  });

  return rules;
}

// executa a validação das regras e dos campos de teste
function validate() {
  const rules = getRulesFromDOM();

  if (rules.length === 0) {
    clearStatus(testInput1);
    clearStatus(testInput2);
    return;
  }

  const nfa = window.grammarEngine.buildNFA(rules);

  if (!nfa) {
    clearStatus(testInput1);
    clearStatus(testInput2);
    return;
  }

  evaluateInput(nfa, testInput1);
  evaluateInput(nfa, testInput2);
}

// avalia um campo de teste individual
function evaluateInput(nfa, input) {
  const text = input.value.trim();

  if (text.length === 0) {
    clearStatus(input);
    return;
  }

  const isValid = window.grammarEngine.testString(nfa, text);

  if (isValid) {
    input.classList.add("valid");
    input.classList.remove("invalid");
  } else {
    input.classList.add("invalid");
    input.classList.remove("valid");
  }
}

function clearStatus(input) {
  input.classList.remove("valid", "invalid");
}

function updateRemoveButtons() {
  const rows = rulesContainer.querySelectorAll(".rule-row");
  const shouldDisable = rows.length <= 1;

  rows.forEach((row) => {
    const btnRemove = row.querySelector(".btn-remove");
    if (btnRemove) {
      btnRemove.disabled = shouldDisable;
    }
  });
}

function getNextSuggestedVariable() {
  const used = new Set();
  const leftInputs = rulesContainer.querySelectorAll(".rule-left");
  leftInputs.forEach((input) => {
    const val = input.value.trim().toUpperCase();
    if (val) used.add(val);
  });

  const alphabet = "SABCDEFGHIJKLMNOPQRTUVWXYZ";
  for (let i = 0; i < alphabet.length; i++) {
    if (!used.has(alphabet[i])) {
      return alphabet[i];
    }
  }
  return "A";
}

// adiciona uma nova caixa de alternativa com separador pipe a uma linha existente
function addAlternative(row, initialValue = "") {
  const altContainer = row.querySelector(".rule-alternatives");
  if (!altContainer) return;

  const existingInputs = altContainer.querySelectorAll(".alt-input");

  if (existingInputs.length > 0) {
    const sep = document.createElement("span");
    sep.className = "pipe-sep";
    sep.textContent = "|";
    altContainer.appendChild(sep);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "alt-input";
  input.placeholder = "ε";
  input.value = initialValue;
  input.setAttribute("aria-label", "Produção alternativa");

  altContainer.appendChild(input);
  input.focus();

  validate();
  return input;
}

// remove a alternativa informada e seu respectivo separador pipe
function removeAlternative(input) {
  const altContainer = input.closest(".rule-alternatives");
  if (!altContainer) return;

  const inputs = Array.from(altContainer.querySelectorAll(".alt-input"));
  if (inputs.length <= 1) return;

  const index = inputs.indexOf(input);
  const targetFocusIndex = index > 0 ? index - 1 : index + 1;
  const targetFocus = inputs[targetFocusIndex];

  // remove o separador associado
  if (input.previousElementSibling && input.previousElementSibling.classList.contains("pipe-sep")) {
    input.previousElementSibling.remove();
  } else if (input.nextElementSibling && input.nextElementSibling.classList.contains("pipe-sep")) {
    input.nextElementSibling.remove();
  }

  input.remove();

  if (targetFocus) {
    targetFocus.focus();
  }

  validate();
}

// cria uma nova linha de produção
function addRuleRow() {
  const row = document.createElement("div");
  row.className = "rule-row";

  const suggestedVar = getNextSuggestedVariable();

  row.innerHTML = `
    <input
      type="text"
      class="rule-left"
      maxlength="3"
      value="${suggestedVar}"
      placeholder="${suggestedVar}"
      aria-label="Não-terminal de origem"
    />
    <span class="rule-arrow">&rarr;</span>
    <div class="rule-alternatives">
      <input
        type="text"
        class="alt-input"
        placeholder="ε"
        aria-label="Produção alternativa"
      />
    </div>
    <button
      type="button"
      class="btn-add-alt"
      title="Adicionar alternativa (|)"
      aria-label="Adicionar alternativa"
    >
      +|
    </button>
    <button
      type="button"
      class="btn-remove"
      title="Remover regra"
      aria-label="Remover regra"
    >
      &times;
    </button>
  `;

  rulesContainer.appendChild(row);
  updateRemoveButtons();

  const firstAlt = row.querySelector(".alt-input");
  if (firstAlt) {
    firstAlt.focus();
  }

  validate();
}

// teclar "|" gera novo campo; backspace em campo vazio remove
rulesContainer.addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("alt-input")) return;

  const row = e.target.closest(".rule-row");

  if (e.key === "|") {
    e.preventDefault();
    addAlternative(row, "");
  } else if (e.key === "Backspace" && e.target.value === "") {
    const altContainer = e.target.closest(".rule-alternatives");
    const inputs = altContainer ? altContainer.querySelectorAll(".alt-input") : [];
    if (inputs.length > 1) {
      e.preventDefault();
      removeAlternative(e.target);
    }
  }
});

// eventos de digitação (input) e colagem com "|"
rulesContainer.addEventListener("input", (e) => {
  if (e.target.classList.contains("rule-left")) {
    e.target.value = e.target.value.toUpperCase();
    validate();
    return;
  }

  if (e.target.classList.contains("alt-input")) {
    const val = e.target.value;

    // caso o usuário cole ou digite texto contendo o caractere "|"
    if (val.includes("|")) {
      const parts = val.split("|");
      e.target.value = parts[0].trim();

      const row = e.target.closest(".rule-row");
      for (let i = 1; i < parts.length; i++) {
        addAlternative(row, parts[i].trim());
      }
    }

    validate();
  }
});

// ações de clique para adicionar alternativa (+|) ou remover regra (×)
rulesContainer.addEventListener("click", (e) => {
  const btnAddAlt = e.target.closest(".btn-add-alt");
  if (btnAddAlt) {
    const row = btnAddAlt.closest(".rule-row");
    if (row) {
      addAlternative(row, "");
    }
    return;
  }

  const btnRemove = e.target.closest(".btn-remove");
  if (btnRemove && !btnRemove.disabled) {
    const row = btnRemove.closest(".rule-row");
    const rows = rulesContainer.querySelectorAll(".rule-row");
    if (rows.length > 1 && row) {
      row.remove();
      updateRemoveButtons();
      validate();
    }
  }
});

updateRemoveButtons();

btnAddRule.addEventListener("click", addRuleRow);
testInput1.addEventListener("input", validate);
testInput2.addEventListener("input", validate);

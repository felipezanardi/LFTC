(function (root) {
  const EPSILON = "ε";

  function normalizeSymbol(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    const lower = trimmed.toLowerCase();
    if (lower === "ε" || lower === "eps" || lower === "epsilon" || lower === "&") {
      return EPSILON;
    }
    return trimmed;
  }

  function parseSymbolsInput(text) {
    if (!text) return [];
    const parts = String(text).split(",");
    const unique = [];
    const seen = new Set();

    parts.forEach((part) => {
      const sym = normalizeSymbol(part);
      if (sym && !seen.has(sym)) {
        seen.add(sym);
        unique.push(sym);
      }
    });

    return unique;
  }

  function validateAutomaton(automaton, mode) {
    const errors = [];
    const states = automaton.states || [];
    const transitions = automaton.transitions || [];

    if (states.length === 0) {
      errors.push("Adicione pelo menos um estado.");
      return { valid: false, errors };
    }

    const initialStates = states.filter((s) => s.isInitial);
    if (initialStates.length === 0) {
      errors.push("Defina um estado inicial.");
    } else if (initialStates.length > 1) {
      errors.push("Deve haver apenas um estado inicial.");
    }

    if (mode === "AFD") {
      const labelById = new Map(states.map((s) => [s.id, s.label || s.id]));
      const outgoing = new Map();

      transitions.forEach((t) => {
        const fromLabel = labelById.get(t.from) || t.from;
        (t.symbols || []).forEach((sym) => {
          if (sym === EPSILON) {
            errors.push(`Modo AFD não permite transição ${EPSILON} (em ${fromLabel}).`);
            return;
          }
          const key = `${t.from}::${sym}`;
          if (!outgoing.has(key)) {
            outgoing.set(key, new Set());
          }
          outgoing.get(key).add(t.to);
        });
      });

      outgoing.forEach((targets, key) => {
        if (targets.size > 1) {
          const [fromId, sym] = key.split("::");
          const fromLabel = labelById.get(fromId) || fromId;
          errors.push(
            `Modo AFD não permite não determinismo: '${fromLabel}' possui múltiplas saídas para '${sym}'.`
          );
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors: Array.from(new Set(errors)),
    };
  }

  function epsilonClosure(stateIds, transitions) {
    const visited = new Set(stateIds);
    const queue = [...stateIds];

    while (queue.length > 0) {
      const current = queue.shift();
      for (let i = 0; i < transitions.length; i++) {
        const t = transitions[i];
        if (t.from === current && t.symbols.includes(EPSILON)) {
          if (!visited.has(t.to)) {
            visited.add(t.to);
            queue.push(t.to);
          }
        }
      }
    }

    return Array.from(visited);
  }

  function simulateSteps(automaton, word) {
    const states = automaton.states || [];
    const transitions = automaton.transitions || [];
    const initialState = states.find((s) => s.isInitial);

    if (!initialState) {
      return { error: "Defina um estado inicial.", steps: [], accepted: false };
    }

    const finalIds = new Set(states.filter((s) => s.isFinal).map((s) => s.id));
    const input = String(word || "");
    const steps = [];

    let activeStates = epsilonClosure([initialState.id], transitions);
    const isZeroLength = input.length === 0;

    steps.push({
      stepIndex: 0,
      activeStates,
      activeTransitions: [],
      consumed: "",
      currentChar: null,
      remaining: input,
      isLast: isZeroLength,
      accepted: isZeroLength ? activeStates.some((id) => finalIds.has(id)) : null,
    });

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const nextTargets = new Set();
      const takenTransitions = [];

      for (let j = 0; j < transitions.length; j++) {
        const t = transitions[j];
        if (activeStates.includes(t.from) && t.symbols.includes(ch)) {
          nextTargets.add(t.to);
          takenTransitions.push(t.id);
        }
      }

      activeStates =
        nextTargets.size > 0
          ? epsilonClosure(Array.from(nextTargets), transitions)
          : [];

      const isLast = i === input.length - 1;
      steps.push({
        stepIndex: i + 1,
        activeStates,
        activeTransitions: takenTransitions,
        consumed: input.slice(0, i + 1),
        currentChar: ch,
        remaining: input.slice(i + 1),
        isLast,
        accepted: isLast ? activeStates.some((id) => finalIds.has(id)) : null,
      });
    }

    return {
      error: null,
      steps,
      accepted: steps[steps.length - 1].accepted,
    };
  }

  function evaluateWord(automaton, word, mode) {
    const validation = validateAutomaton(automaton, mode);
    if (!validation.valid) {
      return {
        valid: false,
        accepted: false,
        error: validation.errors[0],
        finalStates: [],
      };
    }

    const sim = simulateSteps(automaton, word);
    const lastStep = sim.steps[sim.steps.length - 1];
    return {
      valid: true,
      accepted: Boolean(sim.accepted),
      error: null,
      finalStates: lastStep ? lastStep.activeStates : [],
    };
  }

  function getPresetExamples() {
    return {
      afd_ab: {
        name: "AFD: termina com 'ab'",
        mode: "AFD",
        states: [
          { id: "q0", label: "q0", x: 150, y: 170, isInitial: true, isFinal: false },
          { id: "q1", label: "q1", x: 370, y: 170, isInitial: false, isFinal: false },
          { id: "q2", label: "q2", x: 590, y: 170, isInitial: false, isFinal: true },
        ],
        transitions: [
          { id: "t1", from: "q0", to: "q1", symbols: ["a"] },
          { id: "t2", from: "q0", to: "q0", symbols: ["b"] },
          { id: "t3", from: "q1", to: "q1", symbols: ["a"] },
          { id: "t4", from: "q1", to: "q2", symbols: ["b"] },
          { id: "t5", from: "q2", to: "q1", symbols: ["a"] },
          { id: "t6", from: "q2", to: "q0", symbols: ["b"] },
        ],
        sampleWord: "aab",
        batchWords: ["ab", "aaab", "aba", "b"],
      },
      afnd_01: {
        name: "AFND: contém '01' (com ε)",
        mode: "AFND",
        states: [
          { id: "q0", label: "q0", x: 120, y: 170, isInitial: true, isFinal: false },
          { id: "q1", label: "q1", x: 300, y: 170, isInitial: false, isFinal: false },
          { id: "q2", label: "q2", x: 480, y: 170, isInitial: false, isFinal: false },
          { id: "q3", label: "q3", x: 660, y: 170, isInitial: false, isFinal: true },
        ],
        transitions: [
          { id: "t1", from: "q0", to: "q0", symbols: ["0", "1"] },
          { id: "t2", from: "q0", to: "q1", symbols: [EPSILON] },
          { id: "t3", from: "q1", to: "q2", symbols: ["0"] },
          { id: "t4", from: "q2", to: "q3", symbols: ["1"] },
          { id: "t5", from: "q3", to: "q3", symbols: ["0", "1"] },
        ],
        sampleWord: "1010",
        batchWords: ["01", "1010", "110", "00"],
      },
    };
  }

  const engine = {
    EPSILON,
    normalizeSymbol,
    parseSymbolsInput,
    validateAutomaton,
    epsilonClosure,
    simulateSteps,
    evaluateWord,
    getPresetExamples,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = engine;
  }
  root.automatonEngine = engine;
})(typeof window !== "undefined" ? window : globalThis);


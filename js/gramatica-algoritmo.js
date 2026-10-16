/* Algoritmo de conversão e reconhecimento de Gramática Linear à Direita (GLD) */

const EPSILON_SYMBOLS = new Set(["", "&", "e", "E", "eps", "ε", "λ", "lambda"]);

function isEpsilon(token) {
  if (token === undefined || token === null) return true;
  return EPSILON_SYMBOLS.has(token.trim());
}

// cria a estrutura de um AFN a partir das regras informadas
// cada regra deve ser: { left: string, alternatives: string[] }
function buildNFA(rules) {
  const transitions = new Map(); // "state:char" -> Set(nextStates)
  const epsilonTransitions = new Map(); // state -> Set(nextStates)
  const acceptStates = new Set();
  const allStates = new Set();

  let auxCounter = 0;

  function addTransition(from, symbol, to) {
    allStates.add(from);
    allStates.add(to);
    const key = `${from}:${symbol}`;
    if (!transitions.has(key)) {
      transitions.set(key, new Set());
    }
    transitions.get(key).add(to);
  }

  function addEpsilonTransition(from, to) {
    allStates.add(from);
    allStates.add(to);
    if (!epsilonTransitions.has(from)) {
      epsilonTransitions.set(from, new Set());
    }
    epsilonTransitions.get(from).add(to);
  }

  const finalState = "$final";
  acceptStates.add(finalState);
  allStates.add(finalState);

  // considera apenas regras com não-terminal esquerdo preenchido
  const validRules = rules.filter(
    (r) => r.left && r.left.trim().length > 0
  );

  if (validRules.length === 0) {
    return null;
  }

  const declaredNonTerminals = validRules.map((r) => r.left.trim());
  const nonTerminalSet = new Set(declaredNonTerminals);
  const startState = declaredNonTerminals[0];

  // ordena não-terminais por comprimento decrescente para priorizar o match mais longo
  const sortedDeclared = Array.from(nonTerminalSet).sort(
    (a, b) => b.length - a.length
  );

  for (const rule of validRules) {
    const fromState = rule.left.trim();
    allStates.add(fromState);

    const alts = Array.isArray(rule.alternatives)
      ? rule.alternatives
      : [rule.alternatives || ""];

    for (let alt of alts) {
      alt = (alt || "").trim();

      // campo vazio ou símbolo explícito corresponde a epsilon (palavra vazia)
      if (isEpsilon(alt)) {
        acceptStates.add(fromState);
        continue;
      }

      let targetState = null;
      let terminals = "";

      // 1. procura se termina com algum dos não-terminais declarados
      let matchedNT = null;
      for (const nt of sortedDeclared) {
        if (alt.endsWith(nt)) {
          matchedNT = nt;
          break;
        }
      }

      // 2. se não casou com declarado, busca sufixo em maiúscula [A-Z][a-zA-Z0-9]*
      if (!matchedNT) {
        const match = alt.match(/([A-Z][a-zA-Z0-9]*)$/);
        if (match) {
          matchedNT = match[1];
        }
      }

      if (matchedNT) {
        targetState = matchedNT;
        allStates.add(targetState);
        const prefix = alt.slice(0, alt.length - matchedNT.length);
        terminals = prefix.replace(/\s+/g, "");
      } else {
        targetState = finalState;
        terminals = alt.replace(/\s+/g, "");
      }

      // se não há símbolos terminais (ex.: transição vazia A -> B)
      if (terminals.length === 0) {
        if (targetState !== finalState) {
          addEpsilonTransition(fromState, targetState);
        } else {
          acceptStates.add(fromState);
        }
        continue;
      }

      // cria a sequência de transições para os terminais
      let currentState = fromState;
      for (let i = 0; i < terminals.length - 1; i++) {
        const char = terminals[i];
        const intermediateState = `$aux_${auxCounter++}`;
        addTransition(currentState, char, intermediateState);
        currentState = intermediateState;
      }

      const lastTerminal = terminals[terminals.length - 1];
      addTransition(currentState, lastTerminal, targetState);
    }
  }

  return {
    startState,
    acceptStates,
    transitions,
    epsilonTransitions,
  };
}

// calcula o fecho-epsilon de um conjunto de estados
function getEpsilonClosure(states, epsilonTransitions) {
  const closure = new Set(states);
  const queue = [...states];

  while (queue.length > 0) {
    const current = queue.shift();
    const nextStates = epsilonTransitions.get(current);
    if (nextStates) {
      for (const next of nextStates) {
        if (!closure.has(next)) {
          closure.add(next);
          queue.push(next);
        }
      }
    }
  }

  return closure;
}

// avalia se uma palavra é aceita pelo autômato construído a partir da GLD
function testString(nfa, input) {
  if (!nfa || !nfa.startState) {
    return false;
  }

  let currentStates = getEpsilonClosure(
    new Set([nfa.startState]),
    nfa.epsilonTransitions
  );

  // palavra vazia
  if (input === "" || isEpsilon(input)) {
    for (const state of currentStates) {
      if (nfa.acceptStates.has(state)) {
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i < input.length; i++) {
    const symbol = input[i];
    const nextStates = new Set();

    for (const state of currentStates) {
      const key = `${state}:${symbol}`;
      const destinations = nfa.transitions.get(key);
      if (destinations) {
        for (const dest of destinations) {
          nextStates.add(dest);
        }
      }
    }

    if (nextStates.size === 0) {
      return false;
    }

    currentStates = getEpsilonClosure(nextStates, nfa.epsilonTransitions);
  }

  for (const state of currentStates) {
    if (nfa.acceptStates.has(state)) {
      return true;
    }
  }

  return false;
}

window.grammarEngine = {
  buildNFA,
  testString,
  isEpsilon,
};

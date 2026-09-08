const regexInput = document.getElementById("regex");
const caseInsensitive = document.getElementById("caseInsensitive");
const testInput1 = document.getElementById("test1");
const testInput2 = document.getElementById("test2");

function validate() {
  const pattern = regexInput.value;

  if (pattern.length === 0) {
    clearStatus(testInput1);
    clearStatus(testInput2);
    return;
  }

  const flags = caseInsensitive.checked ? "i" : "";

  let regex;
  try {
    regex = new RegExp(pattern, flags);
  } catch (e) {
    clearStatus(testInput1);
    clearStatus(testInput2);
    return;
  }

  evaluateInput(regex, testInput1);
  evaluateInput(regex, testInput2);
}

function evaluateInput(regex, input) {
  const text = input.value;

  if (text.length === 0) {
    clearStatus(input);
    return;
  }

  if (regex.test(text)) {
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

regexInput.addEventListener("input", validate);
caseInsensitive.addEventListener("change", validate);
testInput1.addEventListener("input", validate);
testInput2.addEventListener("input", validate);

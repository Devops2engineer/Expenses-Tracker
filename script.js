// Array that holds all transactions in memory
let transactions = [];

// Get references to the HTML elements we need
const form = document.getElementById("transaction-form");
const errorMessage = document.getElementById("form-error");
const transactionsList = document.getElementById("transactions");
const totalAmountEl = document.getElementById("total-amount");

// Listen for form submission
form.addEventListener("submit", function (event) {
  event.preventDefault(); // Prevent the page from reloading on submit

  const amountInput = document.getElementById("amount");
  const noteInput = document.getElementById("note");
  const dateInput = document.getElementById("date");

  const amount = amountInput.value;
  const note = noteInput.value.trim();
  const date = dateInput.value;

  // Validation: amount must be a positive number
  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    errorMessage.textContent = "Please enter a valid amount greater than 0.";
    return;
  }

  // Validation: date is required
  if (!date) {
    errorMessage.textContent = "Please select a date.";
    return;
  }

  errorMessage.textContent = ""; // Clear any previous error message

  // Create a new transaction object
  const newTransaction = {
    id: Date.now(),
    amount: Number(amount),
    note: note || "No note",
    date: date
  };

  transactions.push(newTransaction); // Add it to the array
  renderTransactions();              // Update what's shown on the page
  form.reset();                      // Clear the form fields
});

// Displays all transactions inside the <ul>, and updates the total badge
function renderTransactions() {
  transactionsList.innerHTML = ""; // Clear the list before re-drawing it

  if (transactions.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-state";
    emptyItem.textContent = "No transactions yet.";
    transactionsList.appendChild(emptyItem);
    updateTotal();
    return;
  }

  transactions.forEach(function (transaction) {
    const listItem = document.createElement("li");

    // Left side: date and note
    const details = document.createElement("span");
    details.innerHTML = `${formatDate(transaction.date)} <span class="transaction-note">— ${transaction.note}</span>`;

    // Right side: amount
    const amountSpan = document.createElement("span");
    amountSpan.textContent = `$${transaction.amount.toFixed(2)}`;

    listItem.appendChild(details);
    listItem.appendChild(amountSpan);
    transactionsList.appendChild(listItem);
  });

  updateTotal();
}

// Calculates and displays the total of all transactions
function updateTotal() {
  const total = transactions.reduce(function (sum, transaction) {
    return sum + transaction.amount;
  }, 0);

  totalAmountEl.textContent = `$${total.toFixed(2)}`;
}

// Formats a date string (e.g. "2026-05-20") into a friendlier format (e.g. "20 May 2026")
function formatDate(dateString) {
  const options = { day: "numeric", month: "short", year: "numeric" };
  return new Date(dateString).toLocaleDateString("en-GB", options);
}

// Show the empty state and total when the page first loads
renderTransactions();
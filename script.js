let goals = [
    {
        name: "Emergency Fund",
        targetAmount: 5000,
        deadline: "2026-12-31",
        deposits: [
            { amount: 500, date: "2026-01-10" },
            { amount: 750, date: "2026-02-15" },
            { amount: 600, date: "2026-03-12" },
            { amount: 850, date: "2026-04-18" },
            { amount: 700, date: "2026-05-20" }
        ]
    },

    {
        name: "New Laptop",
        targetAmount: 3000,
        deadline: "2026-11-30",
        deposits: [
            { amount: 400, date: "2026-02-05" },
            { amount: 350, date: "2026-03-08" },
            { amount: 500, date: "2026-04-10" },
            { amount: 450, date: "2026-05-14" }
        ]
    },

    {
        name: "Holiday Fund",
        targetAmount: 2500,
        deadline: "2026-10-15",
        deposits: [
            { amount: 500, date: "2026-01-05" },
            { amount: 500, date: "2026-02-05" },
            { amount: 500, date: "2026-03-05" },
            { amount: 500, date: "2026-04-05" },
            { amount: 500, date: "2026-05-05" }
        ]
    },

    {
        name: "Gaming Setup",
        targetAmount: 2000,
        deadline: null,
        deposits: [
            { amount: 300, date: "2026-05-05" }
        ]
    }
];
let currentCurrency = localStorage.getItem("currency") || "GBP";
let currentFilter = "all";
let currentSort = "deadline";

const exchangeRates = {
    GBP: 1,
    USD: 1.35,
    EUR: 1.16,
    AED: 4.96,
    CAD: 1.84,
    AUD: 2.09,
    INR: 114,
    NGN: 2150,
    JPY: 200
};

// Load savings goals
function loadGoals() {
    updateDashboard();
    renderGoals();
    renderChart();
    updateChartCurrency();
}

// Convert GBP into selected currency
function convertCurrency(amount) {
    const rate = exchangeRates[currentCurrency] || 1;

    return Number(amount) * rate;
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat("en", {
        style: "currency",
        currency: currentCurrency,
        maximumFractionDigits: 2
    }).format(convertCurrency(amount));
}

// Change selected currency
function changeCurrency() {
    const currencySelect = document.getElementById("currencySelect");

    if (!currencySelect) {
        return;
    }

    currentCurrency = currencySelect.value;

    localStorage.setItem("currency", currentCurrency);

    updateDashboard();
    renderGoals();
    renderChart();
    updateChartCurrency();
}

// Set saved currency
function setupCurrencySelector() {
    const currencySelect = document.getElementById("currencySelect");

    if (!currencySelect) {
        return;
    }

    currencySelect.value = currentCurrency;

    currencySelect.addEventListener("change", changeCurrency);
}

// Calculate total savings
function calculateTotalSavings() {
    let total = 0;

    goals.forEach(goal => {
        total += calculateGoalSavings(goal);
    });

    return total;
}

// Calculate savings for one goal
function calculateGoalSavings(goal) {
    let total = 0;

    if (!goal.deposits) {
        return total;
    }

    goal.deposits.forEach(deposit => {
        total += Number(deposit.amount);
    });

    return total;
}

// Calculate remaining amount
function calculateRemaining(goal) {
    const saved = calculateGoalSavings(goal);
    const target = Number(goal.targetAmount);

    return Math.max(target - saved, 0);
}

// Calculate progress percentage
function calculateProgress(goal) {
    const saved = calculateGoalSavings(goal);
    const target = Number(goal.targetAmount);

    if (target <= 0) {
        return 0;
    }

    return Math.min((saved / target) * 100, 100);
}

// Count active goals
function getActiveGoals() {
    return goals.filter(goal => calculateProgress(goal) < 100).length;
}

// Count completed goals
function getCompletedGoals() {
    return goals.filter(goal => calculateProgress(goal) >= 100).length;
}

// Update dashboard statistics
function updateDashboard() {
    const totalSavingsElement = document.getElementById("totalSavings");
    const activeGoalsElement = document.getElementById("activeGoals");
    const completedGoalsElement = document.getElementById("completedGoals");

    if (totalSavingsElement) {
        totalSavingsElement.textContent =
            formatCurrency(calculateTotalSavings());
    }

    if (activeGoalsElement) {
        activeGoalsElement.textContent = getActiveGoals();
    }

    if (completedGoalsElement) {
        completedGoalsElement.textContent = getCompletedGoals();
    }

    updateCurrencyLabels();
}

// Update hardcoded currency labels
function updateCurrencyLabels() {
    const statIcons = document.querySelectorAll(".stat-icon");

    statIcons.forEach(icon => {
        if (icon.textContent.trim() === "£") {
            icon.textContent = currentCurrency;
        }
    });
}

// Format a deadline
function formatDeadline(deadline) {
    if (!deadline) {
        return "No deadline";
    }

    const date = new Date(deadline);

    if (isNaN(date.getTime())) {
        return "No deadline";
    }

    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Get filtered goals
function getFilteredGoals() {
    if (currentFilter === "active") {
        return goals.filter(goal => calculateProgress(goal) < 100);
    }

    if (currentFilter === "completed") {
        return goals.filter(goal => calculateProgress(goal) >= 100);
    }

    return [...goals];
}

// Sort goals
function sortGoals(goalList) {
    return goalList.sort((firstGoal, secondGoal) => {
        if (currentSort === "deadline") {
            if (!firstGoal.deadline && !secondGoal.deadline) {
                return 0;
            }

            if (!firstGoal.deadline) {
                return 1;
            }

            if (!secondGoal.deadline) {
                return -1;
            }

            return new Date(firstGoal.deadline) -
                new Date(secondGoal.deadline);
        }

        if (currentSort === "progress") {
            return calculateProgress(secondGoal) -
                calculateProgress(firstGoal);
        }

        if (currentSort === "amount") {
            return calculateGoalSavings(secondGoal) -
                calculateGoalSavings(firstGoal);
        }

        if (currentSort === "alphabetical") {
            return firstGoal.name.localeCompare(secondGoal.name);
        }

        return 0;
    });
}

// Create one goal card
function createGoalCard(goal) {
    const saved = calculateGoalSavings(goal);
    const progress = calculateProgress(goal);
    const completed = progress >= 100;

    const card = document.createElement("article");

    card.className = "goal-card";

    if (completed) {
        card.classList.add("completed");
    }

    card.innerHTML = `
        ${
            completed
                ? `<div class="completed-badge">Completed</div>`
                : ""
        }

        <div class="goal-card-header">

            <h3>${escapeHTML(goal.name)}</h3>

            <button
                class="more-btn"
                type="button"
                aria-label="More options for ${escapeHTML(goal.name)}">
                ⋮
            </button>

        </div>

        <div class="goal-amount">
            <strong>${formatCurrency(saved)}</strong>
            <span>of ${formatCurrency(goal.targetAmount)}</span>
        </div>

        <div class="progress-container">

            <div class="progress-bar">
                <div
                    class="progress"
                    style="width: ${progress}%;">
                </div>
            </div>

            <span class="progress-percent">
                ${Math.round(progress)}%
            </span>

        </div>

        <div class="goal-footer">

            <div>
                <span class="label">
                    ${completed ? "Completed" : "Deadline"}
                </span>

                <strong>
                    ${
                        completed
                            ? "Goal reached!"
                            : formatDeadline(goal.deadline)
                    }
                </strong>
            </div>

            <button class="view-btn" type="button">
                View Details
            </button>

        </div>
    `;

    const viewButton = card.querySelector(".view-btn");
    const moreButton = card.querySelector(".more-btn");

    viewButton.addEventListener("click", () => {
        viewGoalDetails(goal);
    });

    moreButton.addEventListener("click", () => {
        showGoalOptions(goal);
    });

    return card;
}

// Display goal cards
function renderGoals() {
    const goalGrid = document.getElementById("goalGrid");
    const emptyState = document.getElementById("emptyState");

    if (!goalGrid) {
        return;
    }

    goalGrid.innerHTML = "";

    let visibleGoals = getFilteredGoals();

    visibleGoals = sortGoals(visibleGoals);

    if (visibleGoals.length === 0) {
        if (emptyState) {
            emptyState.style.display = "block";
        }

        return;
    }

    if (emptyState) {
        emptyState.style.display = "none";
    }

    visibleGoals.forEach(goal => {
        const goalCard = createGoalCard(goal);

        goalGrid.appendChild(goalCard);
    });
}

// View goal details
function viewGoalDetails(goal) {
    const saved = calculateGoalSavings(goal);
    const remaining = calculateRemaining(goal);
    const progress = calculateProgress(goal);

    let depositHistory = "No deposits yet.";

    if (goal.deposits && goal.deposits.length > 0) {
        depositHistory = goal.deposits
            .map(deposit => {
                return `${deposit.date}: ${formatCurrency(deposit.amount)}`;
            })
            .join("\n");
    }

    alert(
        `${goal.name}\n\n` +
        `Saved: ${formatCurrency(saved)}\n` +
        `Target: ${formatCurrency(goal.targetAmount)}\n` +
        `Remaining: ${formatCurrency(remaining)}\n` +
        `Progress: ${Math.round(progress)}%\n` +
        `Deadline: ${formatDeadline(goal.deadline)}\n\n` +
        `Deposit history:\n${depositHistory}`
    );
}

// Display more options
function showGoalOptions(goal) {
    alert(
        `More options for ${goal.name}\n\n` +
        `Edit and delete functions can be added next.`
    );
}

// Setup filter buttons
function setupFilters() {
    const filterButtons = document.querySelectorAll("[data-filter]");

    filterButtons.forEach(button => {
        button.addEventListener("click", () => {
            currentFilter = button.dataset.filter;

            filterButtons.forEach(filterButton => {
                filterButton.classList.remove("active");
            });

            button.classList.add("active");

            renderGoals();
        });
    });
}

// Setup sorting
function setupSorting() {
    const sortSelect = document.getElementById("sortGoals");

    if (!sortSelect) {
        return;
    }

    sortSelect.addEventListener("change", () => {
        currentSort = sortSelect.value;

        renderGoals();
    });
}

// Calculate monthly deposits
function calculateMonthlyDeposits() {
    const monthlyTotals = {
        Jan: 0,
        Feb: 0,
        Mar: 0,
        Apr: 0,
        May: 0,
        Jun: 0,
        Jul: 0,
        Aug: 0,
        Sep: 0,
        Oct: 0,
        Nov: 0,
        Dec: 0
    };

    goals.forEach(goal => {
        if (!goal.deposits) {
            return;
        }

        goal.deposits.forEach(deposit => {
            const date = new Date(deposit.date);

            if (isNaN(date.getTime())) {
                return;
            }

            const month = date.toLocaleDateString("en-US", {
                month: "short"
            });

            if (monthlyTotals[month] !== undefined) {
                monthlyTotals[month] += Number(deposit.amount);
            }
        });
    });

    return monthlyTotals;
}

// Render monthly deposit chart
function renderChart() {
    const chart = document.getElementById("monthlyChart");

    if (!chart) {
        return;
    }

    const monthlyTotals = calculateMonthlyDeposits();
    const values = Object.values(monthlyTotals);
    const maxValue = Math.max(...values, 2000);

    chart.innerHTML = "";

    Object.entries(monthlyTotals).forEach(([month, amount]) => {
        const height = (amount / maxValue) * 100;

        const column = document.createElement("div");

        column.className = "bar-column";

        column.innerHTML = `
            <div
                class="bar"
                style="height: ${height}%"
                title="${month}: ${formatCurrency(amount)}">
            </div>

            <span>${month}</span>
        `;

        chart.appendChild(column);
    });
}

// Update chart currency labels
function updateChartCurrency() {
    const chartYAxis = document.querySelector(".chart-y-axis");

    if (!chartYAxis) {
        return;
    }

    const labels = chartYAxis.querySelectorAll("span");

    const values = [2000, 1500, 1000, 500, 0];

    labels.forEach((label, index) => {
        label.textContent = formatCurrency(values[index]);
    });
}

// Prevent unsafe HTML
function escapeHTML(value) {
    const element = document.createElement("div");

    element.textContent = value;

    return element.innerHTML;
}

// Hide loading screen
function hideLoadingScreen() {
    const loadingScreen = document.getElementById("loadingScreen");

    if (!loadingScreen) {
        return;
    }

    loadingScreen.classList.add("hidden");
}

// Start SaveFlow
document.addEventListener("DOMContentLoaded", () => {
    setupCurrencySelector();
    setupFilters();
    setupSorting();
    loadGoals();

    // Add a short loading delay
    setTimeout(() => {
        hideLoadingScreen();
    }, 1200);
});
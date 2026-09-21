const STORAGE_KEY = "saveflow-goals";
const DATA_FILE_PATH = "./Assests/data.json";

let goals = [];
let currentCurrency = localStorage.getItem("currency") || "GBP";

// Refresh Lucide icons
function refreshIcons() {
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function saveGoalsToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

function exportGoalsToFile() {
    saveGoalsToStorage();

    const payload = JSON.stringify({ goals }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function loadGoalsFromJSON() {
    const savedGoals = localStorage.getItem(STORAGE_KEY);

    if (savedGoals) {
        try {
            goals = JSON.parse(savedGoals);
            loadGoals();
            return;
        } catch (error) {
            console.warn("Saved goals were invalid, reloading from data.json.", error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    try {
        const response = await fetch(DATA_FILE_PATH);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        goals = Array.isArray(data) ? data : data.goals || [];
        saveGoalsToStorage();
    } catch (error) {
        console.error("Could not load goals from data.json:", error);
        goals = [];
    }

    loadGoals();
}

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
    saveGoalsToStorage();
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

// Create one expandable savings-page card
function createSavingsGoalCard(goal) {
    const saved = calculateGoalSavings(goal);
    const progress = calculateProgress(goal);
    const completed = progress >= 100;
    const deposits = [...(goal.deposits || [])].sort((first, second) =>
        new Date(second.date) - new Date(first.date)
    );
    const depositHistory = deposits.length > 0
        ? deposits.map(deposit => `
            <div class="deposit-item">
                <div>
                    <strong>${formatDeadline(deposit.date)}</strong>
                    <span>${escapeHTML(deposit.note || "Deposit")}</span>
                </div>
                <strong>${formatCurrency(deposit.amount)}</strong>
            </div>
        `).join("")
        : `<div class="deposit-list-empty">No deposits yet.</div>`;

    const card = document.createElement("article");
    card.className = "savings-goal-card";
    card.dataset.goalId = goal.id;
    card.innerHTML = `
        <button class="goal-toggle" type="button" aria-expanded="false" aria-controls="goal-details-${goal.id}">
            <div class="goal-icon"><i data-lucide="${escapeHTML(goal.icon || "target")}" aria-hidden="true"></i></div>
            <div class="goal-summary">
                <div class="goal-title-row">
                    <h3>${escapeHTML(goal.name)}</h3>
                    ${goal.priority ? `<span class="priority-badge"><i data-lucide="star"></i> Priority</span>` : ""}
                    ${completed ? `<span class="completed-badge"><i data-lucide="circle-check"></i> Completed</span>` : ""}
                </div>
                <p>${formatCurrency(saved)} saved of ${formatCurrency(goal.targetAmount)}</p>
                <div class="goal-mini-progress">
                    <div class="goal-mini-progress-bar"><div class="goal-mini-progress-fill" style="width: ${progress}%"></div></div>
                    <span>${Math.round(progress)}%</span>
                </div>
            </div>
            <span class="goal-arrow"><i data-lucide="chevron-down" aria-hidden="true"></i></span>
        </button>
        <div class="goal-details" id="goal-details-${goal.id}" hidden>
            <div class="goal-details-top">
                <div class="detail-card"><span>Amount saved</span><strong>${formatCurrency(saved)}</strong></div>
                <div class="detail-card"><span>Target amount</span><strong>${formatCurrency(goal.targetAmount)}</strong></div>
                <div class="detail-card"><span>Remaining</span><strong>${formatCurrency(calculateRemaining(goal))}</strong></div>
            </div>
            <div class="full-progress-section">
                <div class="detail-heading-row"><h4>Goal Progress</h4><strong>${Math.round(progress)}%</strong></div>
                <div class="full-progress-bar"><div class="full-progress-fill" style="width: ${progress}%"></div></div>
            </div>
            <div class="goal-information">
                <div><span>${completed ? "Completed" : "Deadline"}</span><strong>${completed ? "Goal reached!" : formatDeadline(goal.deadline)}</strong></div>
                <div><span>Total deposits</span><strong>${deposits.length}</strong></div>
                <div><span>Highest deposit</span><strong>${formatCurrency(Math.max(0, ...deposits.map(deposit => Number(deposit.amount))))}</strong></div>
            </div>
            <div class="deposit-history">
                <div class="detail-heading-row"><h4>Deposit History</h4><span>${deposits.length} ${deposits.length === 1 ? "deposit" : "deposits"}</span></div>
                <div class="deposit-list">${depositHistory}</div>
            </div>
            <div class="goal-actions">
                ${completed ? "" : `<button class="deposit-now-btn" type="button" data-goal-id="${goal.id}">Deposit Now</button>`}
                <button class="edit-goal-btn" type="button" data-goal-id="${goal.id}">Edit Goal</button>
            </div>
        </div>
    `;

    return card;
}

function createGoal() {
    const name = prompt("Enter the goal name:");
    const target = prompt("Enter the target amount:");
    const targetAmount = Number(target);

    if (!name || !name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) {
        return;
    }

    goals.push({
        id: Date.now(),
        name: name.trim(),
        targetAmount,
        deadline: null,
        priority: false,
        icon: "target",
        deposits: []
    });
    saveGoalsToStorage();
    renderGoals();
    updateDashboard();
}

function editGoal(goal) {
    const name = prompt("Edit goal name:", goal.name);
    const target = prompt("Edit target amount:", goal.targetAmount);
    const targetAmount = Number(target);

    if (!name || !name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) {
        return;
    }

    goal.name = name.trim();
    goal.targetAmount = targetAmount;
    saveGoalsToStorage();
    renderGoals();
    updateDashboard();
}

function depositToGoal(goal) {
    const amount = Number(prompt(`Deposit amount for ${goal.name}:`));

    if (!Number.isFinite(amount) || amount <= 0) {
        return;
    }

    goal.deposits = goal.deposits || [];
    goal.deposits.push({
        id: Date.now(),
        amount,
        date: new Date().toISOString().slice(0, 10),
        note: "Deposit"
    });
    saveGoalsToStorage();
    renderGoals();
    updateDashboard();
    renderChart();
}

// Display goal cards
function renderGoals() {
    const goalGrid = document.getElementById("goalGrid");
    const emptyState = document.getElementById("emptyState");
    const goalList = document.getElementById("goalList");

    if (!goalGrid && goalList) {
        goalList.innerHTML = "";
        const visibleGoals = sortGoals(getFilteredGoals());

        visibleGoals.forEach(goal => {
            goalList.appendChild(createSavingsGoalCard(goal));
        });

        goalList.querySelectorAll(".goal-toggle").forEach(button => {
            button.addEventListener("click", () => {
                const details = button.nextElementSibling;
                const card = button.closest(".savings-goal-card");
                const isOpen = !details.hidden;

                if (!isOpen) {
                    goalList.querySelectorAll(".savings-goal-card.open").forEach(openCard => {
                        if (openCard === card) {
                            return;
                        }

                        const openDetails = openCard.querySelector(".goal-details");
                        const openToggle = openCard.querySelector(".goal-toggle");

                        openDetails.hidden = true;
                        openToggle.setAttribute("aria-expanded", "false");
                        openCard.classList.remove("open");
                    });
                }

                details.hidden = isOpen;
                button.setAttribute("aria-expanded", String(!isOpen));
                card.classList.toggle("open", !isOpen);
            });
        });

        goalList.querySelectorAll(".deposit-now-btn").forEach(button => {
            button.addEventListener("click", () => {
                const goal = goals.find(item => item.id === Number(button.dataset.goalId));
                if (goal) depositToGoal(goal);
            });
        });

        goalList.querySelectorAll(".edit-goal-btn").forEach(button => {
            button.addEventListener("click", () => {
                const goal = goals.find(item => item.id === Number(button.dataset.goalId));
                if (goal) editGoal(goal);
            });
        });

        const goalCount = document.getElementById("goalCount");
        if (goalCount) {
            goalCount.textContent = `${visibleGoals.length} ${visibleGoals.length === 1 ? "Goal" : "Goals"}`;
        }

        refreshIcons();
        return;
    }

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

    if (emptyState) {
        emptyState.style.display = visibleGoals.length === 0 ? "block" : "none";
    }
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

    refreshIcons();

    document.querySelectorAll(".create-goal-btn").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            createGoal();
        });
    });

    const exportButton = document.getElementById("exportGoalsBtn");

    if (exportButton) {
        exportButton.addEventListener("click", exportGoalsToFile);
    }

    loadGoalsFromJSON();

    // Add a short loading delay
    setTimeout(() => {
        hideLoadingScreen();
    }, 1200);
});
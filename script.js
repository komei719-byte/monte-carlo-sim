// DOM要素の取得
const weightAInput = document.getElementById('weightA');
const weightBInput = document.getElementById('weightB');
const isCashAInput = document.getElementById('isCashA');
const isCashBInput = document.getElementById('isCashB');
const runBtn = document.getElementById('runBtn');

let chartInstance = null;

// 配分比率の自動連動
weightAInput.addEventListener('input', () => {
    let valA = parseFloat(weightAInput.value);
    if (isNaN(valA)) valA = 0;
    if (valA < 0) valA = 0;
    if (valA > 100) valA = 100;
    weightAInput.value = valA;
    weightBInput.value = (100 - valA).toFixed(0);
});

// CASH判定時のボラティリティリセット
isCashAInput.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.getElementById('volA').value = 0;
    }
});
isCashBInput.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.getElementById('volB').value = 0;
    }
});

// ボックス＝ミューラー法による標準正規乱数の生成
function generateStandardNormal() {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// 相関を持つ2つの標準正規乱数を生成
function generateCorrelatedNormals(rho) {
    const z1 = generateStandardNormal();
    const z2 = generateStandardNormal();
    const zB = rho * z1 + Math.sqrt(Math.max(0, 1 - rho * rho)) * z2;
    return [z1, zB];
}

// 単一パスのシミュレーション実行 (最大ドローダウン算出対応)
function runSinglePath(params) {
    const { muA, sigmaA, wA, isCashA, muB, sigmaB, wB, isCashB, rho, taxRate, initialCapital, years } = params;
    
    let valA = initialCapital * (wA / 100);
    let valB = initialCapital * (wB / 100);
    
    let costA = valA;
    let costB = valB;

    const path = [initialCapital];

    // ドローダウン追跡用変数
    let peakVal = initialCapital;
    let maxDrawdown = 0; // 正の割合 (例: 0.35 = 35%減)

    const skipRebalance = (wA >= 100 || wB >= 100 || wA <= 0 || wB <= 0);

    for (let y = 1; y <= years; y++) {
        // 1. 幾何ブラウン運動による1年間の資産変動
        const [zA, zB] = generateCorrelatedNormals(rho);
        
        const driftA = muA - 0.5 * sigmaA * sigmaA;
        const driftB = muB - 0.5 * sigmaB * sigmaB;

        valA = valA * Math.exp(driftA + sigmaA * zA);
        valB = valB * Math.exp(driftB + sigmaB * zB);

        // 2. 年1回のリバランス＆譲渡所得課税処理
        if (!skipRebalance) {
            const totalVal = valA + valB;
            const targetValA = totalVal * (wA / 100);
            const targetValB = totalVal * (wB / 100);

            if (valA > targetValA) {
                const sellValA = valA - targetValA;
                let tax = 0;
                if (!isCashA && valA > 0) {
                    const gainRatioA = Math.max(0, (valA - costA) / valA);
                    tax = (sellValA * gainRatioA) * taxRate;
                }

                if (valA > 0) costA -= (sellValA / valA) * costA;
                valA -= sellValA;

                const buyValB = sellValA - tax;
                valB += buyValB;
                costB += buyValB;

            } else if (valB > targetValB) {
                const sellValB = valB - targetValB;
                let tax = 0;
                if (!isCashB && valB > 0) {
                    const gainRatioB = Math.max(0, (valB - costB) / valB);
                    tax = (sellValB * gainRatioB) * taxRate;
                }

                if (valB > 0) costB -= (sellValB / valB) * costB;
                valB -= sellValB;

                const buyValA = sellValB - tax;
                valA += buyValA;
                costA += buyValA;
            }
        }

        const currentTotal = valA + valB;
        path.push(currentTotal);

        // 最大ドローダウン（Peak to Trough）の更新
        if (currentTotal > peakVal) {
            peakVal = currentTotal;
        } else {
            const dd = (peakVal - currentTotal) / peakVal;
            if (dd > maxDrawdown) {
                maxDrawdown = dd;
            }
        }
    }

    return { path, maxDrawdown };
}

// メイン計算処理
function simulate() {
    const params = {
        muA: (parseFloat(document.getElementById('returnA').value) || 0) / 100,
        sigmaA: (parseFloat(document.getElementById('volA').value) || 0) / 100,
        wA: parseFloat(document.getElementById('weightA').value) || 0,
        isCashA: document.getElementById('isCashA').checked,
        
        muB: (parseFloat(document.getElementById('returnB').value) || 0) / 100,
        sigmaB: (parseFloat(document.getElementById('volB').value) || 0) / 100,
        wB: parseFloat(document.getElementById('weightB').value) || 0,
        isCashB: document.getElementById('isCashB').checked,

        rho: parseFloat(document.getElementById('correlation').value) || 0,
        taxRate: (parseFloat(document.getElementById('taxRate').value) || 0) / 100,
        initialCapital: parseFloat(document.getElementById('initialCapital').value) || 1000,
        years: parseInt(document.getElementById('years').value) || 20,
        simulations: parseInt(document.getElementById('simulations').value) || 100
    };

    const allPaths = [];
    const maxDDs = [];

    for (let i = 0; i < params.simulations; i++) {
        const res = runSinglePath(params);
        allPaths.push(res.path);
        maxDDs.push(res.maxDrawdown);
    }

    // --- 1. 資産額の統計（最終年） ---
    const finalValues = allPaths.map(p => p[p.length - 1]).sort((a, b) => a - b);
    
    const getPercentile = (arr, p) => {
        const idx = Math.floor(arr.length * p);
        return arr[Math.min(idx, arr.length - 1)];
    };

    const p10 = getPercentile(finalValues, 0.10);
    const median = getPercentile(finalValues, 0.50);
    const p90 = getPercentile(finalValues, 0.90);

    // 元本割れ確率
    const lossCount = finalValues.filter(v => v < params.initialCapital).length;
    const lossProbability = (lossCount / params.simulations) * 100;

    // --- 2. ドローダウン（最大下落率）の統計 ---
    const sortedDDs = [...maxDDs].sort((a, b) => a - b);
    const medianDD = getPercentile(sortedDDs, 0.50) * 100;

    // 最大DD 50%以上 / 70%以上の確率
    const dd50Count = maxDDs.filter(dd => dd >= 0.50).length;
    const probDD50 = (dd50Count / params.simulations) * 100;

    const dd70Count = maxDDs.filter(dd => dd >= 0.70).length;
    const probDD70 = (dd70Count / params.simulations) * 100;

    // --- UI更新 ---
    document.getElementById('statP10').innerText = `${p10.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 万円`;
    document.getElementById('statMedian').innerText = `${median.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 万円`;
    document.getElementById('statP90').innerText = `${p90.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 万円`;

    // 追加項目の表示更新
    document.getElementById('statLossProb').innerText = `${lossProbability.toFixed(1)} %`;
    document.getElementById('statMedianDD').innerText = `-${medianDD.toFixed(1)} %`;
    document.getElementById('statProbDD50').innerText = `${probDD50.toFixed(1)} %`;
    document.getElementById('statProbDD70').innerText = `${probDD70.toFixed(1)} %`;

    // グラフ更新
    updateChart(allPaths, params.years);
}

// Chart.js グラフ描画
function updateChart(paths, years) {
    const ctx = document.getElementById('simChart').getContext('2d');
    const labels = Array.from({ length: years + 1 }, (_, i) => `${i}年目`);

    const datasets = paths.map((path) => ({
        data: path,
        borderColor: 'rgba(99, 102, 241, 0.15)',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        tension: 0.1
    }));

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw.toFixed(1)} 万円`
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,0.05)' } },
                y: {
                    title: { display: true, text: '資産評価額 (万円)' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

// イベントリスナー登録
runBtn.addEventListener('click', simulate);

// 初期化実行
window.addEventListener('DOMContentLoaded', simulate);
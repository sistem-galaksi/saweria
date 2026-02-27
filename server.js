const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const BACKEND = 'https://backend.saweria.co';
const FRONTEND = 'https://saweria.co';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://saweria.co/',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive'
};

async function createPayment(username, amount, sender, email, message) {
    try {
        console.log(`[Saweria] Creating payment for ${username}`);

        const payload = {
            agree: true,
            notUnderage: true,
            message: message,
            amount: parseInt(amount),
            payment_type: "qris",
            vote: "",
            currency: "IDR",
            customer_info: {
                first_name: sender,
                email: email,
                phone: ""
            }
        };

        // Direct request ke backend dengan username sebagai ID
        // Saweria backend accept direct requests dengan proper headers
        const response = await axios.post(
            `${BACKEND}/donations/${username}`,
            payload,
            {
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        console.log('[Saweria] Payment created successfully');
        return response.data.data;
    } catch (error) {
        // Jika username bukan ID, coba get user info dulu
        if (error.response?.status === 404) {
            try {
                console.log(`[Saweria] Username bukan ID, fetching user info...`);
                const userInfo = await getUserInfo(username);
                
                // Retry dengan user ID
                return await createPaymentWithId(userInfo.id || username, {
                    agree: true,
                    notUnderage: true,
                    message: message,
                    amount: parseInt(amount),
                    payment_type: "qris",
                    vote: "",
                    currency: "IDR",
                    customer_info: {
                        first_name: sender,
                        email: email,
                        phone: ""
                    }
                });
            } catch (e) {
                throw error;
            }
        }
        throw error;
    }
}

async function createPaymentWithId(userId, payload) {
    const response = await axios.post(
        `${BACKEND}/donations/${userId}`,
        payload,
        {
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }
    );

    return response.data.data;
}

async function getUserInfo(username) {
    try {
        console.log(`[Saweria] Getting user info: ${username}`);

        // Try direct backend request first
        try {
            const response = await axios.get(
                `${BACKEND}/user/${username}`,
                {
                    headers,
                    timeout: 10000
                }
            );
            return response.data.data || response.data;
        } catch (e) {
            // Fallback to frontend scraping
            console.log(`[Saweria] Backend endpoint not found, trying frontend...`);
            
            const response = await axios.get(`${FRONTEND}/${username}`, {
                headers,
                timeout: 10000
            });

            const $ = cheerio.load(response.data);
            const nextDataScript = $('#__NEXT_DATA__').html();

            if (!nextDataScript) {
                throw new Error("User not found");
            }

            const nextData = JSON.parse(nextDataScript);
            const userData = nextData?.props?.pageProps?.data || {};

            return {
                id: userData.id,
                username: userData.username,
                displayName: userData.display_name,
                description: userData.description,
                avatar: userData.avatar,
                totalDonations: userData.total_donations,
                currency: userData.currency
            };
        }
    } catch (error) {
        console.error('[Saweria] Get user info error:', error.message);
        throw error;
    }
}

async function checkPaid(transactionId) {
    try {
        console.log(`[Saweria] Checking payment: ${transactionId}`);

        const response = await axios.get(
            `${BACKEND}/donations/qris/${transactionId}`,
            {
                headers,
                timeout: 10000
            }
        );

        if (Math.floor(response.status / 100) !== 2) {
            throw new Error("Transaction not found");
        }

        const data = response.data.data || {};
        return {
            isPaid: data.qr_string === "",
            status: data.status,
            transactionId: transactionId
        };
    } catch (error) {
        console.error('[Saweria] Check paid error:', error.message);
        throw error;
    }
}

app.post('/api/saweria', async (req, res) => {
    try {
        const { action, username, amount, sender, email, message, transactionId } = req.body;

        if (!action) {
            return res.status(400).json({
                status: false,
                message: "Action required: create_payment, get_user_info, check_paid"
            });
        }

        let result;

        if (action === 'create_payment') {
            if (!username || !amount || !sender || !email || !message) {
                return res.status(400).json({
                    status: false,
                    message: "Missing: username, amount, sender, email, message"
                });
            }
            result = await createPayment(username, amount, sender, email, message);
        }
        else if (action === 'get_user_info') {
            if (!username) {
                return res.status(400).json({
                    status: false,
                    message: "Username required"
                });
            }
            result = await getUserInfo(username);
        }
        else if (action === 'check_paid') {
            if (!transactionId) {
                return res.status(400).json({
                    status: false,
                    message: "TransactionId required"
                });
            }
            result = await checkPaid(transactionId);
        }
        else {
            return res.status(400).json({
                status: false,
                message: "Invalid action"
            });
        }

        res.json({
            status: true,
            creator: "dycoders",
            data: result
        });

    } catch (error) {
        console.error('[Error]:', error.message);
        res.status(500).json({
            status: false,
            message: error.message || "Error processing request",
            detail: error.response?.data || null
        });
    }
});

app.get('/', (req, res) => {
    res.json({
        status: true,
        message: "Saweria API is running (Backend Direct)",
        creator: "dycoders",
        endpoints: [
            "POST /api/saweria (create_payment, get_user_info, check_paid)"
        ]
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Using direct backend requests (no WAF bypass needed)`);
});
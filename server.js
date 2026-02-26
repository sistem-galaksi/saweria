const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { zencf } = require('zencf');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const BACKEND = 'https://backend.saweria.co';
const FRONTEND = 'https://saweria.co';

function getCookieString(cookies) {
    if (!cookies || !Array.isArray(cookies)) return '';
    return cookies
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
}

async function createPayment(username, amount, sender, email, message) {
    try {
        const session = await zencf.wafSession(`${FRONTEND}/${username}`);
        const cookieString = getCookieString(session.cookies);

        const response = await axios.get(`${FRONTEND}/${username}`, {
            headers: {
                ...session.headers,
                'Cookie': cookieString
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const nextDataScript = $('#__NEXT_DATA__').html();

        if (!nextDataScript) {
            throw new Error("User not found");
        }

        const nextData = JSON.parse(nextDataScript);
        const userId = nextData?.props?.pageProps?.data?.id;

        if (!userId) {
            throw new Error("User ID not found");
        }

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

        const postResponse = await axios.post(
            `${BACKEND}/donations/${userId}`,
            payload,
            {
                headers: {
                    ...session.headers,
                    'Cookie': cookieString,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        return postResponse.data.data;
    } catch (error) {
        throw error;
    }
}

async function getUserInfo(username) {
    try {
        const session = await zencf.wafSession(`${FRONTEND}/${username}`);
        const cookieString = getCookieString(session.cookies);

        const response = await axios.get(`${FRONTEND}/${username}`, {
            headers: {
                ...session.headers,
                'Cookie': cookieString
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const nextDataScript = $('#__NEXT_DATA__').html();

        if (!nextDataScript) {
            throw new Error("User not found");
        }

        const nextData = JSON.parse(nextDataScript);
        const userData = nextData?.props?.pageProps?.data || {};

        return {
            username: userData.username,
            displayName: userData.display_name,
            description: userData.description,
            avatar: userData.avatar,
            totalDonations: userData.total_donations,
            currency: userData.currency
        };
    } catch (error) {
        throw error;
    }
}

async function checkPaid(transactionId) {
    try {
        const session = await zencf.wafSession(`${BACKEND}/donations/qris/${transactionId}`);
        const cookieString = getCookieString(session.cookies);

        const response = await axios.get(`${BACKEND}/donations/qris/${transactionId}`, {
            headers: {
                ...session.headers,
                'Cookie': cookieString
            },
            timeout: 15000
        });

        if (Math.floor(response.status / 100) !== 2) {
            throw new Error("Transaction not found");
        }

        const data = response.data.data || {};
        return data.qr_string === "";
    } catch (error) {
        throw error;
    }
}

app.post('/api/saweria', async (req, res) => {
    try {
        const { action, username, amount, sender, email, message, transactionId } = req.body;

        if (!action) {
            return res.status(400).json({
                status: false,
                message: "Action required (create_payment, get_user_info, check_paid)"
            });
        }

        let result;

        if (action === 'create_payment') {
            if (!username || !amount || !sender || !email || !message) {
                return res.status(400).json({
                    status: false,
                    message: "Missing parameters: username, amount, sender, email, message"
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
        console.error('Error:', error.message);
        res.status(500).json({
            status: false,
            message: error.message || "Error"
        });
    }
});

app.get('/', (req, res) => {
    res.json({
        status: true,
        message: "Saweria API is running",
        creator: "dycoders"
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
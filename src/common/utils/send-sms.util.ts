import axios from 'axios';

export const sendSMS = async (phone: string, variablesValues: string) => {
    const apiKey = process.env.FAST_TO_SMS_API_KEY;

    // console.log("📩 Sending OTP to:", phone);
    // console.log("🔑 API Key Present:", !!apiKey); // true or false
    // console.log("🔢 OTP Value:", variablesValues);

    try {
        const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
            // Without a timeout a hanging Fast2SMS response ties up the Node
            // thread indefinitely and cascades into slow order creation.
            timeout: 5000,
            params: {
                authorization: apiKey,
                route: 'dlt',
                sender_id: 'DRONEG',        // Your approved sender ID
                message: '194693',          // Template ID from Fast2SMS
                variables_values: variablesValues, // e.g., OTP or custom text values
                numbers: phone,
                flash: '0'
            }
        });

        console.log("✅ SMS API Response:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ SMS API Error");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Headers:", error.response.headers);
            console.error("Data:", error.response.data);
        } else if (error.request) {
            console.error("No Response Received. Request:", error.request);
        } else {
            console.error("Error Message:", error.message);
        }
        throw new Error('Failed to send SMS');

    }
};

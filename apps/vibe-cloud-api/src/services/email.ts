import * as nodemailer from "nodemailer";

export class EmailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    async sendPasswordResetEmail(to: string, token: string) {
        const resetLink = `${process.env.PUBLIC_UI_URL}/auth/reset?token=${token}`;
        const mailOptions = {
            from: process.env.SMTP_FROM,
            to,
            subject: "Reset your Vibe Cloud password",
            html: `
                <p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.</p>
                <p>Please click on the following link, or paste this into your browser to complete the process:</p>
                <p><a href="${resetLink}">${resetLink}</a></p>
                <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
            `,
        };

        await this.transporter.sendMail(mailOptions);
    }
}

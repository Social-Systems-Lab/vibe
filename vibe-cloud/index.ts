import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { Elysia, file, t } from 'elysia';

new Elysia()
    .get('/', 'Hello Elysia')
    .get('/user/:id', ({ params: { id }}) => id)
    .post('/register', ({ body }) => body,
    {
        body: t.Object({
            username: t.String(),
        })
    })
    .listen(7000);

    // app.post('/register', async ({ body }) => {
    //     const { username } = body;
    //     // Generate registration options
    //     const options = await generateRegistrationOptions({ rpName: 'Your App', userID: username, userName: username });
    //     // Store options.challenge in your database for verification later
    //     return options;
    //   });

    //   app.post('/verify-registration', async ({ body }) => {
    //     const { response, username } = body;
    //     // Retrieve the challenge from your database
    //     const expectedChallenge = "dummy"; /* fetch from DB */;
    //     const verification = await verifyRegistrationResponse({
    //       response,
    //       expectedChallenge,
    //       expectedOrigin: 'https://your-app.com',
    //       expectedRPID: 'your-app.com',
    //     });
    //     if (verification.verified) {
    //       // Save the new credential to your database
    //     }
    //     return { verified: verification.verified };
    //   });



console.log(
    `🦊 Elysia is running at http://localhost:7000`
);

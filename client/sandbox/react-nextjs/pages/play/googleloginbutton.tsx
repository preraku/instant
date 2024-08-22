// Now in your App.js

// 1. Import Instant
import { init, tx, id, User } from "@instantdb/react";
import config from "../../config";
import Link from "next/link";
// 2. Import Google login button
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useState } from "react";

// 3. Get your app id
const { auth, useAuth, transact, useQuery } = init(config);

function App() {
  const { isLoading, user, error } = useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return (
      <div>
        <div>Uh oh! {error.message}</div>
        <Login />
      </div>
    );
  }
  if (user) {
    return <Main user={user} />;
  }
  return <Login />;
}

// 4. Create the Google button
function Login() {
  const [error, setError] = useState<string | null>(null);
  const [nonce] = useState(crypto.randomUUID());
  return (
    <div className="p-4 w-6">
      <GoogleOAuthProvider
        // 4a. Use your google client id
        clientId="334689602129-cun7eo9ootvgcgn9dgkb6q6jdsk2hf0j.apps.googleusercontent.com"
        // 4b. Include the nonce on the provider
        nonce={nonce}
      >
        <GoogleLogin
          // 4c. Include the nonce on the button
          nonce={nonce}
          onSuccess={(credentialResponse) => {
            // 5. Log in to instant with the id_token
            const idToken = credentialResponse.credential;
            if (!idToken) {
              setError("Missing id_token.");
              return;
            }
            auth
              .signInWithIdToken({
                // Use the name you created when you registered the client
                clientName: "google-web",
                idToken,
                nonce,
              })
              .catch((err) => {
                console.log(err.body);
                alert("Uh oh: " + err.body?.message);
              });
          }}
          onError={() => {
            setError("Login failed.");
          }}
          type="standard"
        />
        {error}
      </GoogleOAuthProvider>
    </div>
  );
}

// 6. Make queries to your heart's content!
// Checkout InstaQL for examples
// https://paper.dropbox.com/doc/InstaQL--BgBK88TTiSE9OV3a17iCwDjCAg-yVxntbv98aeAovazd9TNL
function Main({ user }: { user: User }) {
  const { isLoading, error, data } = useQuery({ goals: { todos: {} } });
  if (isLoading) return <div>Loading Query...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return (
    <div className="p-4">
      <Link href="/">{"<-"} Home</Link>
      <h1>Hi {user.email}!</h1>
      <h2>id: {user.id}</h2>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded border-2 my-2"
        onClick={(e) => {
          const todoAId = id();
          const todoBId = id();
          transact([
            tx.todos[todoAId].update({
              title: "Go on a run",
              creatorId: user.id,
            }),
            tx.todos[todoBId].update({
              title: "Drink a protein shake",
              creatorId: user.id,
            }),
            tx.goals[id()]
              .update({
                title: "Get six pack abs",
                priority6: 1,
                creatorId: user.id,
              })
              .link({ todos: todoAId })
              .link({ todos: todoBId }),
          ]);
        }}
      >
        Create some example data
      </button>
      <button
        className="px-4 py-2 bg-red-500 text-white rounded border-2 my-2"
        onClick={(e) => {
          const goalIds = data.goals.map((g) => g.id);
          const todoIds = data.goals
            .map((g) => g.todos.map((t) => t.id))
            .flat();
          transact([
            ...goalIds.map((id) => tx.goals[id].delete()),
            ...todoIds.map((id) => tx.todos[id].delete()),
          ]);
        }}
      >
        Clear Data
      </button>

      <button
        className="px-4 py-2 rounded border-2 my-2"
        onClick={(e) => {
          auth.signOut();
        }}
      >
        Sign Out
      </button>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default App;
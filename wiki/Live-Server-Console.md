# Live Server Console

The local dedicated server is owned by a small background service, not the ARK Config Creator window. This means the server can keep running after the app closes.

Open **Set Up Local Server** again to reconnect to the live console. The page displays new stdout/stderr output and can send one console command at a time.

For memory and privacy, no console history is stored. When no app page is connected, output is discarded immediately. Reconnecting therefore shows only output produced after the new connection.

## Stopping the server

While a server is running, the console card shows a **Stop server** button. It asks for confirmation, then shuts the server down through the background service: a polite shutdown first, escalating to a forced stop if the process does not exit within a few seconds. Connected players are disconnected.

Closing the ARK Config Creator window does **not** stop the server — that is the point of the background service. Use **Stop server** when you actually want it to end.

Once no server is running and no page is watching the console, the background service exits on its own after a short idle period.

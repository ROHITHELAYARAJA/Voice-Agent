# python-sdk-example

This example application starts a hello world HTTP server on port 8085 and then uses the [ngrok Python SDK](https://github.com/ngrok/ngrok-python) (`ngrok`) to forward public traffic to that server. See the [quickstart](https://ngrok.com/docs/getting-started/python/) and [SDK reference](https://ngrok.github.io/ngrok-python/) for more details. When you run it, you'll get a public URL that anyone can use to access your app.

## Clone and Run This Example

```sh
git clone git@github.com:ngrok/python-sdk-example.git
cd python-sdk-example
pip install -r requirements.txt
NGROK_AUTHTOKEN=<token> python main.py
```

## License

MIT

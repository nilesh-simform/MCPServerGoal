import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import type { Request, Response } from "express";
import fs from "fs/promises";
import { z } from "zod";

interface Expense {
  description: string;
  amount: number;
  date: string;
  category: string;
  id?: string;
}

function getServer() {
  const server = new McpServer({
    name: "Expense Tracker MCP Server",
    version: "1.0.0",
  });

  async function addExpense(expense: {
    description: string;
    amount: number;
    date: string;
    category: string;
    id?: string;
  }): Promise<void> {
    const expenses: Expense[] = JSON.parse(
      await fs.readFile("./data/expenses.json", "utf-8"),
    );

    expense.id = crypto.randomUUID();

    expenses.push(expense);
    await fs.writeFile(
      "./data/expenses.json",
      JSON.stringify(expenses, null, 2),
    );
  }

  server.registerTool(
    "add-expense",
    {
      title: "Add Expense",
      description: "Add a new expense with the provided details.",
      inputSchema: {
        description: z.string().describe("The description of the expense."),
        amount: z.number().min(0).describe("The amount of the expense."),
        date: z
          .string()
          .describe("The date of the expense in YYYY-MM-DD format."),
        category: z.string().describe("The category of the expense."),
      },
    },
    async ({ description, amount, date, category }) => {
      try {
        await addExpense({ description, amount, date, category });
        return {
          content: [
            {
              type: "text",
              text: `Expense added successfully: ${description} - ₹${amount} on ${date} in category ${category}.`,
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: `Failed to add expense: ${description}.`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "create-random-expense",
    {
      description: "Create a random expense entry with realistic details.",
      title: "Random Expense Generator",
    },
    async () => {
      const result = await server.server.request(
        {
          method: "sampling/createMessage",
          params: {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: "Generate a random expense entry with realistic details. The expense should have a realistic description, an amount between ₹1 and ₹1000, and a date within the last year and category. Return this information in JSON Object with no other text or formatter so it can be parsed easily.",
                },
              },
            ],
            maxTokens: 1024,
          },
        },
        CreateMessageResultSchema,
      );

      if (result.content.type !== "text") {
        return {
          content: [
            { type: "text", text: "Failed to generate expense entry." },
          ],
        };
      }

      try {
        const fakeExpense = JSON.parse(
          result.content.text
            .replace(/^```json/, "")
            .replace(/```$/, "")
            .trim(),
        );

        await addExpense(fakeExpense);
        return {
          content: [
            {
              type: "text",
              text: `Fake expense created successfully: ${fakeExpense.description} - ₹${fakeExpense.amount} on ${fakeExpense.date} in category ${fakeExpense.category}.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to parse generated expense entry.",
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "get-expenses",
    {
      description: "Get a list of all expenses.",
      title: "Get All Expenses",
    },
    async () => {
      const expenses: Expense[] = JSON.parse(
        await fs.readFile("./data/expenses.json", "utf-8"),
      );

      if (expenses.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No expenses found.",
            },
          ],
        };
      }

      const expenseList = expenses
        .map(
          (expense: any) =>
            `${expense.id} ${expense.description} - ₹${expense.amount} on ${expense.date} in ${expense.category} category`,
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Here are your expenses:\n${expenseList}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "clear-expenses",
    {
      description: "Clear all expenses from the tracker.",
      title: "Clear All Expenses",
    },
    async () => {
      await fs.writeFile("./data/expenses.json", JSON.stringify([], null, 2));
      return {
        content: [
          {
            type: "text",
            text: "All expenses have been cleared.",
          },
        ],
      };
    },
  );

  server.registerTool(
    "clear-single-expense",
    {
      description: "Clear a single expense by its id.",
      title: "Clear Single Expense",
      inputSchema: {
        id: z.string().describe("The id of the expense to clear."),
      },
    },
    async ({ id }) => {
      const expenses: Expense[] = JSON.parse(
        await fs.readFile("./data/expenses.json", "utf-8"),
      );

      const expenseIndex = expenses.findIndex((expense) => expense.id === id);

      if (expenseIndex === -1) {
        return {
          content: [
            {
              type: "text",
              text: `Expense with id ${id} not found.`,
            },
          ],
        };
      }

      expenses.splice(expenseIndex, 1);
      await fs.writeFile(
        "./data/expenses.json",
        JSON.stringify(expenses, null, 2),
      );

      return {
        content: [
          {
            type: "text",
            text: `Expense with id ${id} has been cleared.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "edit-expense",
    {
      description: "Edit an existing expense by its id.",
      title: "Edit Expense",
      inputSchema: {
        id: z.string().describe("The id of the expense to edit."),
        description: z.string().describe("The new description of the expense."),
        amount: z.number().min(0).describe("The new amount of the expense."),
        date: z
          .string()
          .describe("The new date of the expense in YYYY-MM-DD format."),
        category: z.string().describe("The new category of the expense."),
      },
    },
    async ({ id, description, amount, date, category }) => {
      const expenses: Expense[] = JSON.parse(
        await fs.readFile("./data/expenses.json", "utf-8"),
      );

      const expenseIndex = expenses.findIndex((expense) => expense.id === id);

      if (expenseIndex === -1) {
        return {
          content: [
            {
              type: "text",
              text: `Expense with id ${id} not found.`,
            },
          ],
        };
      }

      expenses[expenseIndex] = { id, description, amount, date, category };
      await fs.writeFile(
        "./data/expenses.json",
        JSON.stringify(expenses, null, 2),
      );

      return {
        content: [
          {
            type: "text",
            text: `Expense with id ${id} has been updated successfully.`,
          },
        ],
      };
    },
  );

  server.registerResource(
    "expenses",
    "file://data/expenses.json",
    {
      description: "A resource representing all expenses.",
      title: "All Expenses",
      mimeType: "application/json",
    },
    async (uri) => {
      const expenses: Expense[] = JSON.parse(
        await fs.readFile("./data/expenses.json", "utf-8"),
      );

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(expenses, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "expense-entry",
    {
      title: "Expense Entry Prompt",
      description: "A prompt for entering a new expense.",
      argsSchema: {
        description: z.string().describe("The description of the expense."),
        amount: z.string().describe("The amount of the expense."),
        date: z
          .string()
          .describe("The date of the expense in YYYY-MM-DD format."),
        category: z.string().describe("The category of the expense."),
      },
    },
    (variables: {
      description: string;
      amount: string;
      date: string;
      category: string;
    }) => {
      const amount = parseFloat(variables.amount);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Add a new expense with the following details:\nDescription: ${variables.description}\nAmount: ₹${amount}\nDate: ${variables.date}\nCategory: ${variables.category}`,
            },
          },
        ],
      };
    },
  );

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req: Request, res: Response) => {
  const server = getServer();
  try {
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32_603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/", (req: Request, res: Response) => {
  res.send(
    "Welcome to the Expense Tracker MCP Server! Use the /mcp endpoint to interact with the server.",
  );
});

app.post("/", (req: Request, res: Response) => {
  res.send(
    "Welcome to the Expense Tracker MCP Server! Use the /mcp endpoint to interact with the server.",
  );
});

// Start the server
const PORT = 3000;
app.listen(PORT, (error) => {
  if (error) {
    console.error("Failed to start server:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

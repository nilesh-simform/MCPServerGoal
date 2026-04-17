import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { z } from "zod";

interface Expense {
  description: string;
  amount: number;
  date: string;
  category: string;
  id?: string;
}

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
  const expenses: Expense[] = await import("./data/expenses.json", {
    with: { type: "json" },
  }).then((module) => module.default);

  expense.id = crypto.randomUUID();

  expenses.push(expense);
  await fs.writeFile(
    "./src/data/expenses.json",
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
        content: [{ type: "text", text: "Failed to generate expense entry." }],
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
    const expenses: Expense[] = await import("./data/expenses.json", {
      with: { type: "json" },
    }).then((module) => module.default);

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
        (expense: any, index: number) =>
          `${index + 1}. ${expense.description} - ₹${expense.amount} on ${expense.date} in category ${expense.category}`,
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
    await fs.writeFile("./src/data/expenses.json", JSON.stringify([], null, 2));
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
      id: z.number().describe("The id of the expense to clear."),
    },
  },
  async ({ id }) => {
    const expenses: Expense[] = await import("./data/expenses.json", {
      with: { type: "json" },
    }).then((module) => module.default);

    if (id < 1 || id > expenses.length) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid expense id: ${id}.`,
          },
        ],
      };
    }

    expenses.splice(id - 1, 1);
    await fs.writeFile(
      "./src/data/expenses.json",
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
    const expenses: Expense[] = await import("./data/expenses.json", {
      with: { type: "json" },
    }).then((module) => module.default);

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
      "./src/data/expenses.json",
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
    const expenses: Expense[] = await import("./data/expenses.json", {
      with: { type: "json" },
    }).then((module) => module.default);

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

try {
  await main();
} catch (error) {
  console.error("Error While Running Expense Tracker:", error);
  process.exit(1);
}

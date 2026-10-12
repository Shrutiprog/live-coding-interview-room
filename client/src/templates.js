export const TEMPLATES = {
  javascript: `// JavaScript (Node.js)\nfunction solve(input) {\n  return input;\n}\n\nconsole.log("Hello, interview!");\n`,
  python: `# Python 3\ndef solve(data):\n    return data\n\nprint("Hello, interview!")\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, interview!");\n    }\n}\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, interview!" << endl;\n    return 0;\n}\n`,
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, interview!\\n");\n    return 0;\n}\n`,
};
export const MONACO_LANG = { javascript: 'javascript', python: 'python', java: 'java', cpp: 'cpp', c: 'c' };

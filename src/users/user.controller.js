import { User } from "./user.model.js";

const registerUser = async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or email already in use." });
    }

    const user = await User.create({
      username,
      password,
      email: email.toLowerCase(),
    });

    res.status(201).json({
      message: "User registered successfully.",
      user: { id: user._id, email: user.email, username: user.username },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export { registerUser };

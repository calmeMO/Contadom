/*
  # Fix User Profiles RLS Policies

  1. Changes
    - Remove recursive policies that were causing infinite recursion
    - Simplify user profile access policies
    - Add basic role-based access control

  2. Security
    - Enable RLS on user_profiles table
    - Add policies for authenticated users
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;

-- Create new policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins have full access"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (
    role = 'admin'
  );